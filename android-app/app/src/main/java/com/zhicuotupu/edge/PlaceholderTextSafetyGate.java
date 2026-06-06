package com.zhicuotupu.edge;

public class PlaceholderTextSafetyGate implements TextSafetyGate {
    @Override
    public boolean isAllowed(String text) {
        return text != null && !text.trim().isEmpty();
    }
}
