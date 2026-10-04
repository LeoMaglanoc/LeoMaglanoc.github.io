import {
  InterruptableStoppingCriteria,
  TextStreamer,
  env,
  pipeline,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
import { MODEL_CONFIG, WASM_FALLBACK_MODEL_CONFIG } from "./model-config.js";

env.allowLocalModels = false;

let generator = null;
let loading = null;
let activeConfig = null;
const stoppingCriteria = new InterruptableStoppingCriteria();

function post(type, detail = {}) {
  self.postMessage({ type, ...detail });
}

function resolveConfig(config) {
  const supported = [MODEL_CONFIG, WASM_FALLBACK_MODEL_CONFIG];
  return supported.find((candidate) => candidate.id === config?.id && candidate.device === config?.device) || MODEL_CONFIG;
}

async function loadModel(config = activeConfig) {
  if (generator) return generator;
  if (loading) return loading;
  activeConfig = resolveConfig(config);

  loading = pipeline("text-generation", activeConfig.id, {
    dtype: activeConfig.dtype,
    device: activeConfig.device,
    progress_callback: (progress) => post("progress", { progress }),
  })
    .then((instance) => {
      generator = instance;
      post("ready", { config: activeConfig });
      return instance;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

async function generate(messages) {
  const model = await loadModel();
  stoppingCriteria.reset();
  post("generation-start");
  const streamer = new TextStreamer(model.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => post("token", { text }),
  });

  try {
    await model(messages, {
      do_sample: activeConfig.doSample,
      max_new_tokens: activeConfig.maxNewTokens,
      streamer,
      stopping_criteria: stoppingCriteria,
    });
    post("generation-complete");
  } catch (error) {
    post("error", { message: error?.message || "Local generation failed." });
  }
}

self.addEventListener("message", async ({ data }) => {
  if (data.type === "load") {
    try {
      post("checking");
      await loadModel(data.config);
    } catch (error) {
      post("error", { message: error?.message || "Unable to load the local model." });
    }
  }

  if (data.type === "generate") {
    await generate(data.messages);
  }

  if (data.type === "stop") {
    stoppingCriteria.interrupt();
  }
});
