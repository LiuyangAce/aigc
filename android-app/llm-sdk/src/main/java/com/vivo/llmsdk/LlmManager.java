package com.vivo.llmsdk;

import android.os.Handler;
import android.os.Looper;

public class LlmManager {
    static { System.loadLibrary("llm_jni"); }

    private long nativeHandle = 0;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean isGenerating = false;

    public int init(LlmConfig config) {
        if (config.multimodal) {
            nativeHandle = nativeInitMultimodal(
                config.modelPath, config.nPredict, config.nCtx,
                config.nThreads, config.topK, config.topP,
                config.temperature, config.npuPower);
        } else {
            nativeHandle = nativeInit(
                config.modelPath, config.nPredict, config.nCtx,
                config.nThreads, config.topK, config.topP,
                config.temperature, config.npuPower);
        }
        if (nativeHandle == 0) {
            return nativeGetLastError();
        }
        return 0;
    }

    public int callVit(byte[] rgbData, int width, int height) {
        if (nativeHandle == 0) return -1;
        return nativeCallVit(nativeHandle, rgbData, width, height);
    }

    public void generate(String prompt, TokenCallback callback) {
        if (nativeHandle == 0 || isGenerating) return;
        isGenerating = true;
        new Thread(() -> {
            nativeGenerate(nativeHandle, prompt, callback);
            isGenerating = false;
        }).start();
    }

    public void interrupt() {
        if (nativeHandle != 0) nativeInterrupt(nativeHandle);
    }

    public void release() {
        if (nativeHandle != 0) {
            nativeRelease(nativeHandle);
            nativeHandle = 0;
        }
    }

    // JNI 回调：由 llm_jni.cpp 在推理线程调用，派回主线程
    // 注意：这些方法由 C++ 侧通过反射调用，不要重命名
    void onTokenFromNative(TokenCallback cb, String token) {
        mainHandler.post(() -> cb.onToken(token));
    }

    void onCompleteFromNative(TokenCallback cb) {
        mainHandler.post(() -> cb.onComplete());
    }

    void onErrorFromNative(TokenCallback cb, int code, String msg) {
        mainHandler.post(() -> cb.onError(code, msg));
    }

    private native long nativeInit(String modelPath, int nPredict, int nCtx,
        int nThreads, int topK, float topP, float temperature, int npuPower);
    private native long nativeInitMultimodal(String modelPath, int nPredict, int nCtx,
        int nThreads, int topK, float topP, float temperature, int npuPower);
    private native int  nativeGetLastError();
    private native int  nativeCallVit(long handle, byte[] rgbData, int width, int height);
    private native void nativeGenerate(long handle, String prompt, Object callback);
    private native void nativeInterrupt(long handle);
    private native void nativeRelease(long handle);
}
