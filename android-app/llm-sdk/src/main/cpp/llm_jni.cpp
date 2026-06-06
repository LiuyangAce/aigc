#include <jni.h>
#include <string>
#include <android/log.h>
#include "llm_instance.h"

#define TAG "LlmJni"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

using namespace vla;

static JavaVM* gJvm = nullptr;
static jint g_lastError = 0;  // 最近一次 init 的错误码

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
    gJvm = vm;
    return JNI_VERSION_1_6;
}

// nativeInit: 创建 LLM_inference_manager，成功返回指针，失败返回 0（错误码由 nativeGetLastError 获取）
extern "C"
JNIEXPORT jlong JNICALL
Java_com_vivo_llmsdk_LlmManager_nativeInit(
        JNIEnv* env, jobject,
        jstring modelPath, jint nPredict, jint nCtx, jint nThreads,
        jint topK, jfloat topP, jfloat temperature, jint npuPower) {

    const char* pathStr = env->GetStringUTFChars(modelPath, nullptr);
    std::string pathCpp(pathStr);
    env->ReleaseStringUTFChars(modelPath, pathStr);

    LOGI("nativeInit: model_path=%s, nCtx=%d, nPredict=%d, nThreads=%d, npuPower=%d",
         pathCpp.c_str(), (int)nCtx, (int)nPredict, (int)nThreads, (int)npuPower);

    llm_params params;
    params.model_path       = const_cast<char*>(pathCpp.c_str());
    params.context_suffix   = "";         // 由 SDK 从 config JSON 自动选择合适的 context
    params.vocab_json_path  = nullptr;    // bluelm 模型不需要，必须显式置 nullptr 防止 strlen 崩溃
    params.merges_path      = nullptr;    // 同上
    params.runtime          = DX3_APU;
    params.model_type       = BlueLM_3B;
    params.tokenizer_type   = 1;          // 1 = bluelm tokenizer，从 config JSON 读取 vocab
    params.n_predict        = (int)nPredict;
    params.n_ctx            = (int)nCtx;
    params.n_threads        = (int)nThreads;
    params.top_k            = (int)topK;
    params.top_p            = (float)topP;
    params.temp             = (float)temperature;
    params.npu_power        = (int)npuPower;

    auto* llm = new LLM_inference_manager();
    llm_trace trace;
    LLM_CODE res = llm->init_base(params, trace);

    if (res != LLM_SUCCESS) {
        LOGE("init_base failed: %d", (int)res);
        delete llm;
        g_lastError = (jint)res;  // 存错误码
        return 0LL;               // 0 表示失败
    }
    LOGI("init_base success");
    g_lastError = 0;
    return (jlong)(uintptr_t)llm;  // 非零指针表示成功
}

extern "C"
JNIEXPORT jlong JNICALL
Java_com_vivo_llmsdk_LlmManager_nativeInitMultimodal(
        JNIEnv* env, jobject,
        jstring modelPath, jint nPredict, jint nCtx, jint nThreads,
        jint topK, jfloat topP, jfloat temperature, jint npuPower) {

    const char* pathStr = env->GetStringUTFChars(modelPath, nullptr);
    std::string pathCpp(pathStr);
    env->ReleaseStringUTFChars(modelPath, pathStr);

    llm_params params;
    params.model_path       = const_cast<char*>(pathCpp.c_str());
    params.context_suffix   = "";
    params.vocab_json_path  = nullptr;
    params.merges_path      = nullptr;
    params.runtime          = DX3_APU;
    params.model_type       = BlueLM_V_3B;
    params.tokenizer_type   = 1;
    params.n_predict        = (int)nPredict;
    params.n_ctx            = (int)nCtx;
    params.n_threads        = (int)nThreads;
    params.top_k            = (int)topK;
    params.top_p            = (float)topP;
    params.temp             = (float)temperature;
    params.npu_power        = (int)npuPower;

    auto* llm = new LLM_inference_manager();
    llm_trace trace;
    LLM_CODE res = llm->init_base(params, trace);

    if (res != LLM_SUCCESS) {
        LOGE("init_base multimodal failed: %d", (int)res);
        delete llm;
        g_lastError = (jint)res;
        return 0LL;
    }
    LOGI("init_base multimodal success");
    g_lastError = 0;
    return (jlong)(uintptr_t)llm;
}

extern "C"
JNIEXPORT jint JNICALL
Java_com_vivo_llmsdk_LlmManager_nativeCallVit(
        JNIEnv* env, jobject, jlong handle,
        jbyteArray rgbData, jint width, jint height) {

    auto* llm = reinterpret_cast<LLM_inference_manager*>((uintptr_t)handle);

    jbyte* data = env->GetByteArrayElements(rgbData, nullptr);
    Image_Data image;
    image.input_width  = (int)width;
    image.input_height = (int)height;
    image.image_buf    = reinterpret_cast<const uint8_t*>(data);

    LLM_CODE ret = llm->call_vit(image);

    env->ReleaseByteArrayElements(rgbData, data, JNI_ABORT);
    if (ret != LLM_SUCCESS) {
        LOGE("call_vit failed: %d", (int)ret);
    }
    return (jint)ret;
}

// nativeGenerate: 推理，通过 LlmManager 的 Java 方法回调
extern "C"
JNIEXPORT void JNICALL
Java_com_vivo_llmsdk_LlmManager_nativeGenerate(
        JNIEnv* env, jobject thiz, jlong handle,
        jstring prompt, jobject callback) {

    auto* llm = reinterpret_cast<LLM_inference_manager*>((uintptr_t)handle);
    const char* promptStr = env->GetStringUTFChars(prompt, nullptr);
    std::string promptCpp(promptStr);
    env->ReleaseStringUTFChars(prompt, promptStr);

    // 获取 LlmManager 的回调方法 ID
    jclass managerCls = env->GetObjectClass(thiz);
    jmethodID onTokenMid = env->GetMethodID(managerCls,
        "onTokenFromNative",
        "(Lcom/vivo/llmsdk/TokenCallback;Ljava/lang/String;)V");
    jmethodID onCompleteMid = env->GetMethodID(managerCls,
        "onCompleteFromNative",
        "(Lcom/vivo/llmsdk/TokenCallback;)V");
    jmethodID onErrorMid = env->GetMethodID(managerCls,
        "onErrorFromNative",
        "(Lcom/vivo/llmsdk/TokenCallback;ILjava/lang/String;)V");

    // 全局引用，防 GC
    jobject cbGlobal   = env->NewGlobalRef(callback);
    jobject thizGlobal = env->NewGlobalRef(thiz);

    eval_callback evalCb = [cbGlobal, thizGlobal, onTokenMid](
            const std::string& token, void*) {
        JNIEnv* cbEnv = nullptr;
        gJvm->AttachCurrentThread(&cbEnv, nullptr);
        jstring jtoken = cbEnv->NewStringUTF(token.c_str());
        cbEnv->CallVoidMethod(thizGlobal, onTokenMid, cbGlobal, jtoken);
        cbEnv->DeleteLocalRef(jtoken);
    };

    LLM_CODE ret = llm->forward(promptCpp, true, evalCb, nullptr);

    // 每次推理结束后必须 reset，否则第二次调用 KV cache 脏数据导致崩溃
    llm->llm_reset();

    // 回调 onComplete 或 onError
    JNIEnv* endEnv = nullptr;
    gJvm->AttachCurrentThread(&endEnv, nullptr);
    if (ret == LLM_SUCCESS || ret == LLM_INTERRUPTED) {
        endEnv->CallVoidMethod(thizGlobal, onCompleteMid, cbGlobal);
    } else {
        jstring errMsg = endEnv->NewStringUTF("inference failed");
        endEnv->CallVoidMethod(thizGlobal, onErrorMid, cbGlobal,
            (jint)ret, errMsg);
        endEnv->DeleteLocalRef(errMsg);
    }

    env->DeleteGlobalRef(cbGlobal);
    env->DeleteGlobalRef(thizGlobal);
}

extern "C"
JNIEXPORT void JNICALL
Java_com_vivo_llmsdk_LlmManager_nativeInterrupt(
        JNIEnv*, jobject, jlong handle) {
    reinterpret_cast<LLM_inference_manager*>((uintptr_t)handle)->llm_interrupt();
}

extern "C"
JNIEXPORT void JNICALL
Java_com_vivo_llmsdk_LlmManager_nativeRelease(
        JNIEnv*, jobject, jlong handle) {
    auto* llm = reinterpret_cast<LLM_inference_manager*>((uintptr_t)handle);
    llm->release();
    delete llm;
}

// nativeGetLastError: 返回最近一次 init 失败的错误码
extern "C"
JNIEXPORT jint JNICALL
Java_com_vivo_llmsdk_LlmManager_nativeGetLastError(JNIEnv*, jobject) {
    return g_lastError;
}
