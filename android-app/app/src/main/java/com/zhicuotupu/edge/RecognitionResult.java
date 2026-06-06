package com.zhicuotupu.edge;

import org.json.JSONObject;

public class RecognitionResult {
    public final String questionText;
    public final String userAnswerCandidate;
    public final String correctionNotes;
    public final String rawText;

    private RecognitionResult(
        String questionText,
        String userAnswerCandidate,
        String correctionNotes,
        String rawText
    ) {
        this.questionText = questionText;
        this.userAnswerCandidate = userAnswerCandidate;
        this.correctionNotes = correctionNotes;
        this.rawText = rawText;
    }

    public static RecognitionResult fromModelOutput(String output) throws Exception {
        int start = output.indexOf('{');
        int end = output.lastIndexOf('}');
        if (start < 0 || end <= start) throw new IllegalArgumentException("未找到完整 JSON");
        JSONObject json = new JSONObject(output.substring(start, end + 1));
        return new RecognitionResult(
            json.optString("question_text", ""),
            json.optString("user_answer_candidate", ""),
            json.optString("correction_notes", ""),
            json.optString("raw_text", "")
        );
    }
}
