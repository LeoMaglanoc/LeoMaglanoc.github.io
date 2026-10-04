# The Android NDK packages shaderc and the matching SPIR-V headers but not a
# CMake package file. llama.cpp asks for that package while configuring its
# Vulkan shader generator, so expose the NDK copy without downloading a second
# Vulkan SDK.
set(SPIRV-Headers_FOUND TRUE)
include_directories("${CMAKE_ANDROID_NDK}/sources/third_party/shaderc/third_party/spirv-tools/external/spirv-headers/include")
