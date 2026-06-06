package com.vivo.llmsdk;

public interface TokenCallback {
    void onToken(String token);
    void onComplete();
    void onError(int code, String msg);
}
