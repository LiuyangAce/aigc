cmake_minimum_required(VERSION 3.22.1)
project(llm_jni)

# 头文件目录
include_directories(src/main/cpp/include)

# 声明三个预编译 so 为 IMPORTED 库
add_library(llm_base SHARED IMPORTED)
set_target_properties(llm_base PROPERTIES IMPORTED_LOCATION
    ${CMAKE_SOURCE_DIR}/src/main/jniLibs/arm64-v8a/libllm_base_7b.so)

add_library(llm_apu SHARED IMPORTED)
set_target_properties(llm_apu PROPERTIES IMPORTED_LOCATION
    ${CMAKE_SOURCE_DIR}/src/main/jniLibs/arm64-v8a/libllm_apu_7b.so)

add_library(vivo_tokenizer SHARED IMPORTED)
set_target_properties(vivo_tokenizer PROPERTIES IMPORTED_LOCATION
    ${CMAKE_SOURCE_DIR}/src/main/jniLibs/arm64-v8a/libvivo_tokenizer.so)

# JNI 桥接层
add_library(llm_jni SHARED src/main/cpp/llm_jni.cpp)
target_compile_options(llm_jni PRIVATE -std=c++11)
# 16 KB page size 对齐，Android 15+ 要求
target_link_options(llm_jni PRIVATE -Wl,-z,max-page-size=16384)
target_link_libraries(llm_jni
    llm_base
    llm_apu
    vivo_tokenizer
    android
    log)
