from pydantic import BaseModel, Field


class AnalyzeQuestionRequest(BaseModel):
    question_text: str = Field(..., min_length=1)
    user_answer: str = ""
    subject: str = "通用"
    correction_notes: str = ""
    mistake_hint: str = ""
    raw_recognition_text: str = ""


class RecommendedExercise(BaseModel):
    title: str
    answer: str
    explanation: str


class AnalyzeQuestionResponse(BaseModel):
    id: str
    subject: str
    chapter: str
    knowledge_points: list[str]
    error_type: str
    error_reason: str
    solution: str
    review_outline: list[str]
    recommended_exercises: list[RecommendedExercise]
    weakness_score: int = Field(ge=0, le=100)
    difficulty: str = "中等"
    mastery_hint: str = "需要复习"
    next_actions: list[str] = []


class OcrQuestionResponse(BaseModel):
    text: str
    source: str
    question_text: str = ""
    user_answer: str = ""
    correction_notes: str = ""
    mistake_hint: str = ""
    raw_text: str = ""
    confidence: float | None = None
