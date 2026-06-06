package com.zhicuotupu.edge;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.exifinterface.media.ExifInterface;
import com.vivo.llmsdk.LlmConfig;
import com.vivo.llmsdk.LlmManager;
import com.vivo.llmsdk.TokenCallback;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {
    private static final int REQUEST_PICK_IMAGE = 1001;
    private static final int MAX_IMAGE_EDGE = 1280;
    private static final String MODEL_PATH = "/sdcard/1225/1.7.0.4_1225_mtk9500";
    private static final String PREFS_NAME = "edge_cloud_settings";
    private static final String PREF_API_URL = "analysis_api_url";
    private static final String PREF_OFFLINE_RESULT = "offline_recognition_result";
    private static final String DEFAULT_ANALYSIS_API_URL =
        "https://zhicuotupu-api.onrender.com/api/analyze-question";
    private static final String RECOGNITION_PROMPT =
        "你只负责从错题图片提取文字和视觉线索，不要判断答案是否正确，不要验算，不要分析错因。"
            + "严格区分学生黑色手写与老师红笔批改；无法确定内容属于学生作答时，user_answer_candidate必须返回空字符串。"
            + "只返回一行合法JSON，不要解释，不要Markdown，每个字段不超过180字，无法确定则返回空字符串："
            + "{\"question_text\":\"\",\"user_answer_candidate\":\"\",\"correction_notes\":\"\",\"raw_text\":\"\"}";

    private final LlmManager llmManager = new LlmManager();
    private final TextSafetyGate safetyGate = new PlaceholderTextSafetyGate();
    private ImageView preview;
    private TextView status;
    private TextView rawOutput;
    private EditText questionText;
    private EditText userAnswer;
    private EditText correctionNotes;
    private EditText apiUrl;
    private TextView answerHint;
    private TextView cloudResult;
    private Button pickImage;
    private Button recognize;
    private Button retry;
    private Button interrupt;
    private Button saveOffline;
    private Button cloudAnalyze;
    private boolean modelReady;
    private boolean vitReady;
    private boolean generating;
    private boolean cloudBusy;
    private StringBuilder generatedText = new StringBuilder();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        bindViews();
        requestStorageAccessIfNeeded();
        bindActions();
        initializeModel();
    }

    private void bindViews() {
        preview = findViewById(R.id.ivPreview);
        status = findViewById(R.id.tvStatus);
        rawOutput = findViewById(R.id.tvRawOutput);
        questionText = findViewById(R.id.etQuestionText);
        userAnswer = findViewById(R.id.etUserAnswer);
        correctionNotes = findViewById(R.id.etCorrectionNotes);
        apiUrl = findViewById(R.id.etApiUrl);
        answerHint = findViewById(R.id.tvAnswerHint);
        cloudResult = findViewById(R.id.tvCloudResult);
        pickImage = findViewById(R.id.btnPickImage);
        recognize = findViewById(R.id.btnRecognize);
        retry = findViewById(R.id.btnRetry);
        interrupt = findViewById(R.id.btnInterrupt);
        saveOffline = findViewById(R.id.btnSaveOffline);
        cloudAnalyze = findViewById(R.id.btnCloudAnalyze);
        apiUrl.setText(getPreferences().getString(PREF_API_URL, DEFAULT_ANALYSIS_API_URL));
        restoreOfflineResult();
    }

    private void bindActions() {
        pickImage.setOnClickListener(view -> selectImage());
        recognize.setOnClickListener(view -> recognizeQuestion());
        retry.setOnClickListener(view -> recognizeQuestion());
        saveOffline.setOnClickListener(view -> saveRecognitionOffline());
        cloudAnalyze.setOnClickListener(view -> analyzeWithCloud());
        interrupt.setOnClickListener(view -> {
            llmManager.interrupt();
            setStatus("正在中断端侧识别...");
        });
    }

    private void requestStorageAccessIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:" + getPackageName())
            );
            startActivity(intent);
        }
    }

    private void initializeModel() {
        setStatus("正在后台初始化端侧多模态模型...");
        new Thread(() -> {
            LlmConfig config = new LlmConfig();
            config.modelPath = MODEL_PATH;
            config.multimodal = true;
            config.nPredict = 512;
            config.nCtx = 2048;
            config.nThreads = 4;
            config.npuPower = 100;
            int result = llmManager.init(config);
            runOnUiThread(() -> {
                modelReady = result == 0;
                pickImage.setEnabled(modelReady);
                if (modelReady) {
                    setStatus("端侧识别：模型已就绪。图片只在设备内处理，不会上传云端。");
                } else {
                    setStatus("模型初始化失败：" + explainError(result));
                }
            });
        }).start();
    }

    private void selectImage() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("image/*");
        startActivityForResult(intent, REQUEST_PICK_IMAGE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_PICK_IMAGE && resultCode == RESULT_OK && data != null && data.getData() != null) {
            processImage(data.getData());
        }
    }

    private void processImage(Uri uri) {
        setBusy(true);
        vitReady = false;
        clearResults();
        setStatus("端侧识别：正在修正图片方向并执行 VIT 编码...");
        new Thread(() -> {
            try {
                Bitmap bitmap = decodeScaledBitmap(uri);
                Bitmap oriented = rotateFromExif(uri, bitmap);
                Bitmap rgbBitmap = oriented.copy(Bitmap.Config.ARGB_8888, false);
                byte[] rgbData = toRgb(rgbBitmap);
                int result = llmManager.callVit(rgbData, rgbBitmap.getWidth(), rgbBitmap.getHeight());
                runOnUiThread(() -> {
                    preview.setImageBitmap(rgbBitmap);
                    vitReady = result == 0;
                    setBusy(false);
                    recognize.setEnabled(vitReady);
                    retry.setEnabled(vitReady);
                    if (vitReady) {
                        setStatus("端侧识别：图片编码完成（" + rgbBitmap.getWidth() + "×"
                            + rgbBitmap.getHeight() + "），可以提取文字。");
                    } else {
                        setStatus("VIT 编码失败：" + explainError(result));
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    setBusy(false);
                    setStatus("图片处理失败：" + safeMessage(error));
                });
            }
        }).start();
    }

    private Bitmap decodeScaledBitmap(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(stream, null, bounds);
        }
        int sampleSize = 1;
        while (Math.max(bounds.outWidth / sampleSize, bounds.outHeight / sampleSize) > MAX_IMAGE_EDGE) {
            sampleSize *= 2;
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize;
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            Bitmap bitmap = BitmapFactory.decodeStream(stream, null, options);
            if (bitmap == null) throw new IllegalArgumentException("无法解码所选图片");
            return scaleToMaxEdge(bitmap, MAX_IMAGE_EDGE);
        }
    }

    private Bitmap scaleToMaxEdge(Bitmap source, int maxEdge) {
        int longest = Math.max(source.getWidth(), source.getHeight());
        if (longest <= maxEdge) return source;
        float ratio = maxEdge / (float) longest;
        return Bitmap.createScaledBitmap(
            source,
            Math.round(source.getWidth() * ratio),
            Math.round(source.getHeight() * ratio),
            true
        );
    }

    private Bitmap rotateFromExif(Uri uri, Bitmap source) {
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            ExifInterface exif = new ExifInterface(stream);
            int orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            );
            float degrees = 0;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) degrees = 90;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_180) degrees = 180;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_270) degrees = 270;
            if (degrees == 0) return source;
            Matrix matrix = new Matrix();
            matrix.postRotate(degrees);
            return Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), matrix, true);
        } catch (Exception ignored) {
            return source;
        }
    }

    private byte[] toRgb(Bitmap bitmap) {
        ByteBuffer buffer = ByteBuffer.allocate(bitmap.getWidth() * bitmap.getHeight() * 4);
        bitmap.copyPixelsToBuffer(buffer);
        byte[] argb = buffer.array();
        byte[] rgb = new byte[bitmap.getWidth() * bitmap.getHeight() * 3];
        for (int index = 0; index < bitmap.getWidth() * bitmap.getHeight(); index++) {
            rgb[index * 3] = argb[index * 4 + 1];
            rgb[index * 3 + 1] = argb[index * 4 + 2];
            rgb[index * 3 + 2] = argb[index * 4 + 3];
        }
        return rgb;
    }

    private void recognizeQuestion() {
        if (!modelReady || !vitReady || generating) return;
        if (!safetyGate.isAllowed(RECOGNITION_PROMPT)) {
            setStatus("识别请求未通过文本审核。");
            return;
        }
        clearResults();
        generatedText = new StringBuilder();
        setGenerating(true);
        setStatus("端侧识别：BlueLM_V_3B 正在提取文字与视觉线索...");
        String prompt = "[|Human|]:<im_start><image><im_end>" + RECOGNITION_PROMPT + "\n[|AI|]:";
        llmManager.generate(prompt, new TokenCallback() {
            @Override
            public void onToken(String token) {
                generatedText.append(token);
                rawOutput.setText(generatedText.toString());
            }

            @Override
            public void onComplete() {
                setGenerating(false);
                handleRecognitionComplete(generatedText.toString());
            }

            @Override
            public void onError(int code, String message) {
                setGenerating(false);
                setStatus("端侧推理失败：" + explainError(code) + " " + message);
            }
        });
    }

    private void handleRecognitionComplete(String output) {
        if (!safetyGate.isAllowed(output)) {
            clearResults();
            setStatus("识别结果未通过文本审核，已停止展示。");
            return;
        }
        try {
            RecognitionResult result = RecognitionResult.fromModelOutput(output);
            questionText.setText(result.questionText);
            userAnswer.setText(result.userAnswerCandidate);
            correctionNotes.setText(result.correctionNotes);
            answerHint.setText(result.userAnswerCandidate.trim().isEmpty()
                ? "学生作答候选 · 未可靠识别，需要确认"
                : "学生作答候选 · 端侧结果，需要确认");
            answerHint.setTextColor(result.userAnswerCandidate.trim().isEmpty() ? 0xFFC65D45 : 0xFF246BFD);
            setStatus("等待确认：端侧提取完成，请修正内容后提交豆包分析或离线保存。");
        } catch (Exception error) {
            setStatus("结果未形成完整 JSON，可查看原始输出并点击重新识别。");
        }
    }

    private void saveRecognitionOffline() {
        String question = questionText.getText().toString().trim();
        if (question.isEmpty()) {
            setStatus("离线保存失败：请先确认题目内容。");
            return;
        }
        try {
            JSONObject saved = buildAnalysisPayload();
            saved.put("saved_at", System.currentTimeMillis());
            getPreferences().edit().putString(PREF_OFFLINE_RESULT, saved.toString()).apply();
            cloudResult.setText("已离线保存识别结果，尚未完成云端诊断。");
            setStatus("离线保存：识别结果已保存在本机，联网后可继续提交豆包分析。");
        } catch (Exception error) {
            setStatus("离线保存失败：" + safeMessage(error));
        }
    }

    private void analyzeWithCloud() {
        if (cloudBusy) return;
        String endpoint = apiUrl.getText().toString().trim();
        if (endpoint.isEmpty()) {
            setStatus("云端分析：请先填写公网 FastAPI 的 /api/analyze-question 地址。");
            return;
        }
        if (questionText.getText().toString().trim().isEmpty()) {
            setStatus("云端分析：请先确认题目内容。");
            return;
        }
        getPreferences().edit().putString(PREF_API_URL, endpoint).apply();
        final String requestBody;
        try {
            requestBody = buildAnalysisPayload().toString();
        } catch (Exception error) {
            setStatus("云端分析：无法整理确认结果，" + safeMessage(error));
            return;
        }
        cloudBusy = true;
        cloudAnalyze.setEnabled(false);
        saveOffline.setEnabled(false);
        cloudResult.setText("豆包正在验算并分析错因...");
        setStatus("云端分析：正在提交已确认的结构化文字，原始图片不会上传。");
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(120000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                byte[] body = requestBody.getBytes(StandardCharsets.UTF_8);
                try (OutputStream stream = connection.getOutputStream()) {
                    stream.write(body);
                }
                int statusCode = connection.getResponseCode();
                InputStream responseStream = statusCode >= 200 && statusCode < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
                String response = readText(responseStream);
                if (statusCode < 200 || statusCode >= 300) {
                    throw new IllegalStateException("HTTP " + statusCode + "：" + response);
                }
                String formatted = formatCloudAnalysis(new JSONObject(response));
                runOnUiThread(() -> {
                    cloudBusy = false;
                    cloudAnalyze.setEnabled(true);
                    saveOffline.setEnabled(true);
                    cloudResult.setText(formatted);
                    setStatus("云端分析：豆包诊断完成。端侧负责识别，云端负责验算与错因判断。");
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    cloudBusy = false;
                    cloudAnalyze.setEnabled(true);
                    saveOffline.setEnabled(true);
                    cloudResult.setText("云端诊断失败，可检查接口地址或网络后重试，也可先离线保存。\n\n"
                        + safeMessage(error));
                    setStatus("云端分析失败：端侧识别结果仍可编辑或离线保存。");
                });
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private JSONObject buildAnalysisPayload() throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("question_text", questionText.getText().toString().trim());
        payload.put("user_answer", userAnswer.getText().toString().trim());
        payload.put("subject", "通用");
        payload.put("correction_notes", correctionNotes.getText().toString().trim());
        payload.put("mistake_hint", "");
        payload.put("raw_recognition_text", rawOutput.getText().toString().trim());
        return payload;
    }

    private String formatCloudAnalysis(JSONObject result) {
        StringBuilder text = new StringBuilder();
        appendResult(text, "学科 / 章节", result.optString("subject") + " · " + result.optString("chapter"));
        appendResult(text, "错误类型", result.optString("error_type"));
        appendResult(text, "错因诊断", result.optString("error_reason"));
        appendResult(text, "正确思路", result.optString("solution"));
        JSONArray points = result.optJSONArray("knowledge_points");
        if (points != null) appendResult(text, "知识点", joinJsonArray(points));
        JSONArray actions = result.optJSONArray("next_actions");
        if (actions != null) appendResult(text, "下一步", joinJsonArray(actions));
        return text.toString().trim();
    }

    private void appendResult(StringBuilder text, String label, String value) {
        if (value == null || value.trim().isEmpty() || value.trim().equals("·")) return;
        if (text.length() > 0) text.append("\n\n");
        text.append(label).append("\n").append(value.trim());
    }

    private String joinJsonArray(JSONArray values) {
        StringBuilder text = new StringBuilder();
        for (int index = 0; index < values.length(); index++) {
            String value = values.optString(index).trim();
            if (value.isEmpty()) continue;
            if (text.length() > 0) text.append("、");
            text.append(value);
        }
        return text.toString();
    }

    private String readText(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(stream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) text.append(line);
        }
        return text.toString();
    }

    private SharedPreferences getPreferences() {
        return getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    }

    private void restoreOfflineResult() {
        String saved = getPreferences().getString(PREF_OFFLINE_RESULT, "");
        if (saved.isEmpty()) return;
        try {
            JSONObject result = new JSONObject(saved);
            questionText.setText(result.optString("question_text", ""));
            userAnswer.setText(result.optString("user_answer", ""));
            correctionNotes.setText(result.optString("correction_notes", ""));
            rawOutput.setText(result.optString("raw_recognition_text", ""));
            cloudResult.setText("已恢复上次离线保存的识别结果，尚未完成云端诊断。");
            answerHint.setText("学生作答候选 · 已恢复，需要确认");
        } catch (Exception ignored) {
            getPreferences().edit().remove(PREF_OFFLINE_RESULT).apply();
        }
    }

    private void setBusy(boolean busy) {
        pickImage.setEnabled(modelReady && !busy && !generating);
        recognize.setEnabled(vitReady && !busy && !generating);
        retry.setEnabled(vitReady && !busy && !generating);
    }

    private void setGenerating(boolean active) {
        generating = active;
        interrupt.setVisibility(active ? View.VISIBLE : View.GONE);
        setBusy(active);
    }

    private void clearResults() {
        questionText.setText("");
        userAnswer.setText("");
        correctionNotes.setText("");
        rawOutput.setText("");
        cloudResult.setText("尚未完成云端诊断");
        answerHint.setText("学生作答候选 · 需要确认");
        answerHint.setTextColor(0xFFC65D45);
    }

    private void setStatus(String message) {
        status.setText(message);
    }

    private String explainError(int code) {
        if (code == -1001) return "-1001，模型配置不存在，请检查模型路径";
        if (code == -2101) return "-2101，基座模型与设备运行时不匹配";
        if (code == -2104) return "-2104，VIT 多模态模型缺失或损坏";
        if (code == -2105) return "-2105，Tokenizer 加载失败";
        return String.valueOf(code);
    }

    private String safeMessage(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    @Override
    protected void onDestroy() {
        if (generating) llmManager.interrupt();
        llmManager.release();
        super.onDestroy();
    }
}
