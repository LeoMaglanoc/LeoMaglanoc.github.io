#include <jni.h>
#include <android/log.h>
#include <chrono>
#include <cstring>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

#include "llama.h"
#include "ggml-backend.h"
#include "ggml-vulkan.h"

namespace {
llama_model * model = nullptr;
llama_context * context = nullptr;
std::mutex inference_mutex;
std::string gpu_name;

std::string quote(const std::string & value) {
    std::string escaped;
    for (const char c : value) {
        if (c == '\\' || c == '"') escaped += '\\';
        if (c == '\n') escaped += "\\n";
        else if (c != '\n') escaped += c;
    }
    return "\"" + escaped + "\"";
}

std::string error_json(const std::string & message) { return "{\"error\":" + quote(message) + "}"; }

void unload() {
    if (context) { llama_free(context); context = nullptr; }
    if (model) { llama_model_free(model); model = nullptr; }
    gpu_name.clear();
}

std::string load_model(const char * path) {
    std::lock_guard<std::mutex> lock(inference_mutex);
    unload();
    llama_backend_init();
    ggml_backend_reg_t vk = ggml_backend_vk_reg();
    if (!vk || ggml_backend_reg_dev_count(vk) == 0) return error_json("Vulkan device was not detected.");
    ggml_backend_dev_t device = ggml_backend_reg_dev_get(vk, 0);
    if (!device) return error_json("Vulkan device selection failed.");
    gpu_name = ggml_backend_dev_name(device);
    ggml_backend_dev_t devices[] = { device, nullptr };
    llama_model_params parameters = llama_model_default_params();
    parameters.devices = devices;
    parameters.n_gpu_layers = -1;
    model = llama_model_load_from_file(path, parameters);
    if (!model) return error_json("llama.cpp could not load the GGUF model with Vulkan.");
    llama_context_params context_parameters = llama_context_default_params();
    // A 768-token context is sufficient for the short game history and six
    // acceptance prompts while keeping the all-GPU E2B model within mobile
    // memory limits.  This is not a CPU fallback.
    context_parameters.n_ctx = 768;
    context_parameters.n_batch = 384;
    context = llama_init_from_model(model, context_parameters);
    if (!context) { unload(); return error_json("llama.cpp could not create a Vulkan context."); }
    __android_log_print(ANDROID_LOG_INFO, "GatekeeperLlm", "backend=vulkan gpu=%s gpu_layers=%d cpu-only=false", gpu_name.c_str(), llama_model_n_layer(model));
    std::ostringstream output;
    output << "{\"platform\":\"android\",\"backend\":\"vulkan\",\"model\":\"Gemma 4 E2B\",\"quantization\":\"Q4_K_M\",\"gpuName\":" << quote(gpu_name) << ",\"gpuConfirmed\":true,\"gpuLayers\":" << llama_model_n_layer(model) << "}";
    return output.str();
}

std::string generate(const char * prompt, int max_tokens) {
    std::lock_guard<std::mutex> lock(inference_mutex);
    if (!model || !context) return error_json("Model is not loaded.");
    const auto started = std::chrono::steady_clock::now();
    // Each game turn is a self-contained prompt.  Do not retain a previous
    // visitor's KV cache in the next request.
    llama_memory_clear(llama_get_memory(context), true);
    const llama_vocab * vocab = llama_model_get_vocab(model);
    const int count = -llama_tokenize(vocab, prompt, strlen(prompt), nullptr, 0, true, true);
    if (count <= 0 || count >= 700) return error_json("Prompt exceeds the configured context window.");
    std::vector<llama_token> tokens(count);
    if (llama_tokenize(vocab, prompt, strlen(prompt), tokens.data(), count, true, true) < 0) return error_json("Tokenization failed.");
    if (llama_decode(context, llama_batch_get_one(tokens.data(), tokens.size())) != 0) return error_json("Prompt decode failed.");
    llama_sampler * sampler = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(sampler, llama_sampler_init_greedy());
    std::string text;
    long first_ms = 0;
    int generated_tokens = 0;
    for (int i = 0; i < max_tokens; ++i) {
        llama_token next = llama_sampler_sample(sampler, context, -1);
        if (llama_vocab_is_eog(vocab, next)) break;
        char piece[256];
        const int bytes = llama_token_to_piece(vocab, next, piece, sizeof(piece), 0, true);
        if (bytes > 0) text.append(piece, bytes);
        ++generated_tokens;
        if (!first_ms) first_ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - started).count();
        if (llama_decode(context, llama_batch_get_one(&next, 1)) != 0) { llama_sampler_free(sampler); return error_json("Token decode failed."); }
    }
    llama_sampler_free(sampler);
    const long total_ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - started).count();
    const double rate = total_ms ? (1000.0 * generated_tokens / total_ms) : 0.0;
    std::ostringstream output;
    output << "{\"text\":" << quote(text) << ",\"tokens\":" << generated_tokens << ",\"firstTokenMs\":" << first_ms << ",\"generationMs\":" << total_ms << ",\"tokensPerSecond\":" << rate << "}";
    __android_log_print(ANDROID_LOG_INFO, "GatekeeperLlm", "generation_ms=%ld first_token_ms=%ld", total_ms, first_ms);
    return output.str();
}
}

extern "C" JNIEXPORT jstring JNICALL Java_com_leomaglanoc_gatekeeper_NativeLlmPlugin_nativeLoadModel(JNIEnv * env, jclass, jstring path) {
    const char * chars = env->GetStringUTFChars(path, nullptr);
    const std::string result = load_model(chars);
    env->ReleaseStringUTFChars(path, chars);
    return env->NewStringUTF(result.c_str());
}
extern "C" JNIEXPORT jstring JNICALL Java_com_leomaglanoc_gatekeeper_NativeLlmPlugin_nativeGenerate(JNIEnv * env, jclass, jstring prompt, jint max_tokens) {
    const char * chars = env->GetStringUTFChars(prompt, nullptr);
    const std::string result = generate(chars, max_tokens);
    env->ReleaseStringUTFChars(prompt, chars);
    return env->NewStringUTF(result.c_str());
}
extern "C" JNIEXPORT void JNICALL Java_com_leomaglanoc_gatekeeper_NativeLlmPlugin_nativeUnload(JNIEnv *, jclass) { std::lock_guard<std::mutex> lock(inference_mutex); unload(); }
