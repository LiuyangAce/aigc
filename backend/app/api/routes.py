import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.schemas import (
    AnalyzeQuestionRequest,
    AnalyzeQuestionResponse,
    OcrQuestionResponse,
)
from app.services.graph_service import get_knowledge_graph
from app.services.mock_data import DEMO_QUESTIONS
from app.services.vivo_ai import analyze_question, recognize_question_image


router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/questions")
def list_questions() -> list[AnalyzeQuestionResponse]:
    return DEMO_QUESTIONS


@router.post("/ocr-question")
async def ocr_question_route(
    image: UploadFile = File(...),
    subject: str = Form("通用"),
) -> OcrQuestionResponse:
    try:
        image_bytes = await image.read()
        return recognize_question_image(
            image_bytes=image_bytes,
            filename=image.filename or "question.jpg",
            content_type=image.content_type or "image/jpeg",
            subject=subject,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="图片识别响应超时，请稍后重试。") from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        raise HTTPException(status_code=502, detail=f"图片识别接口返回错误：{detail}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"图片识别失败：{exc}") from exc


@router.post("/analyze-question")
def analyze_question_route(payload: AnalyzeQuestionRequest) -> AnalyzeQuestionResponse:
    try:
        return analyze_question(payload)
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="蓝心大模型响应超时，请稍后重试，或切换为更快的模型。",
        ) from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        raise HTTPException(status_code=502, detail=f"蓝心大模型接口返回错误：{detail}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"蓝心大模型调用失败：{exc}") from exc


@router.get("/knowledge-graph")
def knowledge_graph() -> dict[str, list[dict[str, object]]]:
    return get_knowledge_graph(DEMO_QUESTIONS)

