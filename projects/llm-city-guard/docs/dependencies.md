# Pinned native and avatar dependencies

| Dependency | Pin | Purpose | License boundary |
| --- | --- | --- | --- |
| Hanami | `6787685c8d40e4e79bffbb0d389b478f32ef88d6` | Reference-only VRM implementation study | Its application source is AGPL-3.0. Gatekeeper imports none of it. |
| llama.cpp | `c6824a9e42ceeda5d58089fa274ddd816e59e68e` | Android native inference | MIT; statically linked by the Android CMake target. |
| Vulkan-Hpp | `1a24b015830c116632a0723f3ccfd1f06009ce12` (v1.3.275) | C++ Vulkan headers matched to NDK r29 | Apache-2.0; header-only dependency. |
| Seed-san | SHA-256 `624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23` | Temporary Gatekeeper VRM avatar | VRM Public License 1.0, VirtualCast, Inc.; redistribution and modification allowed, attribution required. See `public/avatar/LICENSE.md`. |
| Gemma 4 E2B GGUF | `ggml-org/gemma-4-E2B-GGUF@0d85c394df5e9f3c5b07c791e31680e399042acc` | Android source for reproducible Q4 quantization | Apache-2.0. The upstream offers BF16 and Q8; Gatekeeper must record its local Q4 conversion SHA-256 and size before device acceptance. |
| Phone acceptance GGUF | `mradermacher/gemma-4-E2B-GGUF@3762686d74ff8db6c98f8d3c389f56fbdf994d5a`, `gemma-4-E2B.Q4_K_M.gguf` | User-authorized direct-to-phone Q4 acceptance artifact | Apache-2.0. The app verifies 3,427,861,984 bytes and SHA-256 `389c868898bffed97fd178646f88562cafecc6f60983a636bac53b131fd068a2` before it will use the model. |
| Gemma 4 E2B ONNX | `onnx-community/gemma-4-E2B-it-ONNX@9f4bef82ea6e296bc69f8a2f5939f73af81b07a6` | Browser WebGPU model | Apache-2.0; Q4F16 text assets are not committed. |

## Android build pins

- JDK: Temurin 21.0.8+9 (required by Capacitor Android 8)
- minSdk / compileSdk / targetSdk: 28 / 36 / 36 (API 28 is required for the Vulkan 1.1 symbols linked by llama.cpp)
- Android NDK: 29.0.13113456
- CMake: 3.31.6
- Gradle wrapper: 8.14.3

Use `JAVA_HOME` pointing at JDK 21 and `ANDROID_SDK_ROOT` with the matching SDK,
NDK, and CMake installed. The physical-device workflow may use host `adb`.
