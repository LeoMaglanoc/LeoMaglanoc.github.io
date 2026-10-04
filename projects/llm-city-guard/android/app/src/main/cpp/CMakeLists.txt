cmake_minimum_required(VERSION 3.22.1)
project(gatekeeper_llm LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(LLAMA_SRC ${CMAKE_CURRENT_LIST_DIR}/../../../../../vendor/llama.cpp)
set(VULKAN_HPP_SRC ${CMAKE_CURRENT_LIST_DIR}/../../../../../vendor/Vulkan-Hpp)

# Android NDK ships the host shader compiler alongside the Vulkan headers and
# loader. Point FindVulkan at it so cross compilation does not require a
# separate, unpinned desktop Vulkan SDK.
set(Vulkan_GLSLC_EXECUTABLE "${CMAKE_ANDROID_NDK}/shader-tools/linux-x86_64/glslc" CACHE FILEPATH "Android NDK glslc" FORCE)
set(SPIRV-Headers_DIR "${CMAKE_CURRENT_LIST_DIR}/spirv-headers" CACHE PATH "Use the SPIR-V headers shipped by the pinned Android NDK" FORCE)
# The NDK supplies Vulkan's C API. llama.cpp's Vulkan backend also uses the
# official C++ bindings, which are vendored at a pinned revision below.
include_directories("${VULKAN_HPP_SRC}")

# This is a statically linked Vulkan backend. A missing device is an error at
# runtime; the bridge must never silently select a CPU-only model load.
add_subdirectory(${LLAMA_SRC} build-llama)
add_library(gatekeeper_llm SHARED bridge.cpp)
target_include_directories(gatekeeper_llm PRIVATE ${LLAMA_SRC}/include ${LLAMA_SRC}/ggml/include)
target_link_libraries(gatekeeper_llm PRIVATE llama ggml-vulkan android log vulkan)
