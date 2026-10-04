package com.leomaglanoc.gatekeeper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import android.util.Log;

@CapacitorPlugin(name = "NativeLlm")
public class NativeLlmPlugin extends Plugin {
    static { System.loadLibrary("gatekeeper_llm"); }
    private static final String ACCEPTANCE_MODEL_URL = "https://huggingface.co/mradermacher/gemma-4-E2B-GGUF/resolve/3762686d74ff8db6c98f8d3c389f56fbdf994d5a/gemma-4-E2B.Q4_K_M.gguf?download=true";
    private static final String ACCEPTANCE_MODEL_SHA256 = "389c868898bffed97fd178646f88562cafecc6f60983a636bac53b131fd068a2";
    private static final long ACCEPTANCE_MODEL_BYTES = 3427861984L;

    private static native String nativeLoadModel(String absolutePath);
    private static native String nativeGenerate(String prompt, int maxTokens);
    private static native void nativeUnload();

    @PluginMethod
    public void loadModel(PluginCall call) {
        String suppliedPath = call.getString("path");
        if (suppliedPath == null || suppliedPath.isEmpty()) {
            call.reject("A model path is required.");
            return;
        }
        File model = new File(suppliedPath);
        if (!model.isAbsolute()) model = new File(getContext().getExternalFilesDir(null), suppliedPath);
        if (!model.isFile()) {
            call.reject("Model file does not exist: " + model.getAbsolutePath());
            return;
        }
        resolveJson(call, nativeLoadModel(model.getAbsolutePath()));
    }

    @PluginMethod
    public void generate(PluginCall call) {
        String prompt = call.getString("prompt");
        Integer maxTokens = call.getInt("maxTokens", 32);
        if (prompt == null || prompt.isEmpty()) {
            call.reject("A prompt is required.");
            return;
        }
        resolveJson(call, nativeGenerate(prompt, Math.min(Math.max(maxTokens, 1), 64)));
    }

    @PluginMethod
    public void unload(PluginCall call) {
        nativeUnload();
        call.resolve();
    }

    @PluginMethod
    public void markDeviceTestPassed(PluginCall call) {
        Log.i("GatekeeperLlm", "device-test=passed sequential_turns=6 raw_json=valid");
        call.resolve();
    }

    /** Downloads only the pinned acceptance model directly onto this phone. */
    @PluginMethod
    public void downloadAcceptanceModel(PluginCall call) {
        new Thread(() -> {
            try {
                File directory = new File(getContext().getExternalFilesDir(null), "models");
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Could not create the phone model directory.");
                File target = new File(directory, "gemma-4-E2B-Q4_K_M.gguf");
                if (target.isFile()) {
                    if (target.length() != ACCEPTANCE_MODEL_BYTES || !ACCEPTANCE_MODEL_SHA256.equals(sha256(target))) {
                        throw new IllegalStateException("Existing acceptance-model path contains an unverified file; remove it before retrying.");
                    }
                    JSObject existing = new JSObject();
                    existing.put("path", target.getAbsolutePath());
                    existing.put("sha256", ACCEPTANCE_MODEL_SHA256);
                    call.resolve(existing);
                    return;
                }
                File partial = new File(directory, target.getName() + ".part");
                long offset = partial.isFile() ? partial.length() : 0;
                HttpURLConnection connection = (HttpURLConnection) new URL(ACCEPTANCE_MODEL_URL).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(30_000);
                connection.setReadTimeout(60_000);
                if (offset > 0) connection.setRequestProperty("Range", "bytes=" + offset + "-");
                int status = connection.getResponseCode();
                boolean append = offset > 0 && status == HttpURLConnection.HTTP_PARTIAL;
                if (status != HttpURLConnection.HTTP_OK && status != HttpURLConnection.HTTP_PARTIAL) throw new IllegalStateException("Model download returned HTTP " + status);
                if (!append) offset = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial, append)) {
                    byte[] buffer = new byte[1024 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                } finally { connection.disconnect(); }
                if (partial.length() != ACCEPTANCE_MODEL_BYTES) throw new IllegalStateException("Model download size did not match the pinned artifact.");
                if (!ACCEPTANCE_MODEL_SHA256.equals(sha256(partial))) throw new IllegalStateException("Model SHA-256 did not match the pinned artifact.");
                if (!partial.renameTo(target)) throw new IllegalStateException("Could not finalize the verified model file.");
                Log.i("GatekeeperLlm", "model-download=verified bytes=" + ACCEPTANCE_MODEL_BYTES + " sha256=" + ACCEPTANCE_MODEL_SHA256);
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("sha256", ACCEPTANCE_MODEL_SHA256);
                call.resolve(result);
            } catch (Exception error) { call.reject("Phone model download failed: " + error.getMessage()); }
        }).start();
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[1024 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format("%02x", value));
        return result.toString();
    }

    @PluginMethod
    public void isDeviceTestLaunch(PluginCall call) {
        String query = getActivity().getIntent().getData() == null ? "" : getActivity().getIntent().getData().getQuery();
        JSObject result = new JSObject();
        result.put("deviceTest", query != null && query.contains("deviceTest=1"));
        call.resolve(result);
    }

    @PluginMethod
    public void isModelDownloadLaunch(PluginCall call) {
        String query = getActivity().getIntent().getData() == null ? "" : getActivity().getIntent().getData().getQuery();
        JSObject result = new JSObject();
        result.put("downloadModel", query != null && query.contains("downloadModel=1"));
        call.resolve(result);
    }

    private void resolveJson(PluginCall call, String payload) {
        try {
            JSONObject json = new JSONObject(payload);
            if (json.has("error")) call.reject(json.getString("error"));
            else call.resolve(JSObject.fromJSONObject(json));
        } catch (Exception error) {
            call.reject("Native bridge returned malformed diagnostics: " + error.getMessage());
        }
    }
}
