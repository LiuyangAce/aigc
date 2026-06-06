package com.vivo.llmsdk;

public class LlmConfig {
    public String modelPath;
    public int    nPredict    = 200;
    public int    nCtx        = 4096;
    public int    nThreads    = 4;
    public int    topK        = 1;
    public float  topP        = 1.0f;
    public float  temperature = 0.0f;
    public int    npuPower    = 100;
    public boolean multimodal = false;
}
