import base64
import json
import re
from uuid import uuid4

import httpx

from app.core.config import settings
from app.models.schemas import (
    AnalyzeQuestionRequest,
    AnalyzeQuestionResponse,
    OcrQuestionResponse,
    RecommendedExercise,
)


def analyze_question(payload: AnalyzeQuestionRequest) -> AnalyzeQuestionResponse:
    if settings.vivo_app_key and not settings.vivo_use_mock:
        return _analyze_question_with_vivo(payload)

    return _mock_analyze_question(payload)


def recognize_question_image(
    image_bytes: bytes,
    filename: str,
    content_type: str,
    subject: str = "通用",
) -> OcrQuestionResponse:
    if settings.vivo_app_key and not settings.vivo_use_mock:
        try:
            return _recognize_with_structured_vision_model(image_bytes, content_type, subject)
        except Exception:
            if settings.vivo_ocr_api_url:
                return _recognize_with_ocr_api(image_bytes, filename, content_type, subject)
            raise

    return OcrQuestionResponse(
        text="请在这里确认或补充图片中的题目内容。",
        question_text="请在这里确认或补充图片中的题目内容。",
        raw_text="请在这里确认或补充图片中的题目内容。",
        source="vision_fallback",
        confidence=None,
    )


def _mock_analyze_question(payload: AnalyzeQuestionRequest) -> AnalyzeQuestionResponse:
    text = payload.question_text

    if "apple" in text.lower() or "yesterday" in text.lower():
        return AnalyzeQuestionResponse(
            id=f"q-{uuid4().hex[:8]}",
            subject="英语",
            chapter="时态",
            knowledge_points=["一般过去时", "时间状语", "动词过去式"],
            error_type="语法规则",
            error_reason="题目中出现过去时间线索，但作答没有同步调整谓语动词形式。",
            solution="先圈出时间状语，再根据时态规则选择正确谓语形式。",
            review_outline=["识别时间状语", "复习一般过去时", "整理不规则动词"],
            recommended_exercises=[
                RecommendedExercise(title="I ___ a book yesterday. (read)", answer="read", explanation="read 过去式拼写不变，读音变化。"),
                RecommendedExercise(title="He ___ football last Sunday. (play)", answer="played", explanation="last Sunday 表示过去，play 加 -ed。"),
                RecommendedExercise(title="We ___ at home two days ago. (be)", answer="were", explanation="We 对应 were。"),
            ],
            weakness_score=68,
            difficulty="基础",
            mastery_hint="能识别题型，但需要加强时态触发词。",
            next_actions=["复习过去时", "做 3 道时态小测"],
        )

    if "函数" in text or "x^2" in text:
        return AnalyzeQuestionResponse(
            id=f"q-{uuid4().hex[:8]}",
            subject=payload.subject if payload.subject != "通用" else "数学",
            chapter="函数",
            knowledge_points=["二次函数", "配方法", "函数最值"],
            error_type="概念理解",
            error_reason="题目涉及函数最值，常见错误是混淆最小值和取得最小值时的自变量。",
            solution="建议先把函数化为顶点式，再分别写出最值和对应的 x。",
            review_outline=["复习二次函数顶点式", "练习配方法", "整理最值类错题"],
            recommended_exercises=[
                RecommendedExercise(title="求 y=x^2-6x+5 的最小值。", answer="-4", explanation="y=(x-3)^2-4，因此最小值为 -4。"),
                RecommendedExercise(title="求 y=x^2+2x-8 的最小值。", answer="-9", explanation="y=(x+1)^2-9，因此最小值为 -9。"),
                RecommendedExercise(title="y=3x^2-12x+8 在哪里取最小值？", answer="x=2", explanation="y=3(x-2)^2-4，因此 x=2。"),
            ],
            weakness_score=80,
            difficulty="中等",
            mastery_hint="函数最值是当前薄弱点，建议马上做小测巩固。",
            next_actions=["回看顶点式", "完成函数最值小测", "收藏本题"],
        )

    return AnalyzeQuestionResponse(
        id=f"q-{uuid4().hex[:8]}",
        subject=payload.subject,
        chapter="综合应用",
        knowledge_points=["题意理解", "数量关系", "步骤表达"],
        error_type="审题偏差",
        error_reason="需要先把题目中的已知量、变化量和问题目标分开，避免直接凭感觉计算。",
        solution="把条件列成式子，再逐步计算并检查单位或对象是否一致。",
        review_outline=["标记关键词", "列出已知量和未知量", "复盘计算步骤"],
        recommended_exercises=[
            RecommendedExercise(title="小明有 12 个苹果，送出 5 个，还剩几个？", answer="7 个", explanation="12-5=7。"),
            RecommendedExercise(title="一本书 30 页，读了 18 页，还剩几页？", answer="12 页", explanation="30-18=12。"),
            RecommendedExercise(title="水杯有 8 个，增加 6 个后共有几个？", answer="14 个", explanation="8+6=14。"),
        ],
        weakness_score=58,
        difficulty="基础",
        mastery_hint="基础关系能理解，重点是把题意转成算式。",
        next_actions=["圈出数量变化词", "做 3 道应用题小测"],
    )


def _analyze_question_with_vivo(
    payload: AnalyzeQuestionRequest,
) -> AnalyzeQuestionResponse:
    content = _chat_completion(
        model=settings.vivo_model_name,
        messages=[
            {
                "role": "system",
                "content": "你是严谨的多学科错题分析助手。必须只返回合法 JSON，不输出 Markdown 或前后缀。",
            },
            {"role": "user", "content": _build_analysis_prompt(payload)},
        ],
        max_tokens=1600,
    )
    parsed = _parse_json_content(content)

    return AnalyzeQuestionResponse(
        id=f"q-{uuid4().hex[:8]}",
        subject=str(parsed.get("subject") or payload.subject),
        chapter=str(parsed.get("chapter") or "待确认章节"),
        knowledge_points=_ensure_str_list(parsed.get("knowledge_points")) or ["待确认知识点"],
        error_type=str(parsed.get("error_type") or "待确认错因"),
        error_reason=str(parsed.get("error_reason") or "模型未返回明确错因。"),
        solution=str(parsed.get("solution") or "模型未返回完整解题思路。"),
        review_outline=_ensure_str_list(parsed.get("review_outline")) or ["复盘题干条件", "整理同类题"],
        recommended_exercises=_parse_exercises(parsed.get("recommended_exercises")),
        weakness_score=_normalize_score(parsed.get("weakness_score")),
        difficulty=str(parsed.get("difficulty") or "中等"),
        mastery_hint=str(parsed.get("mastery_hint") or "需要结合错题继续复习。"),
        next_actions=_ensure_str_list(parsed.get("next_actions")) or ["完成小测", "收藏错题", "复习薄弱知识点"],
    )


def _recognize_with_ocr_api(
    image_bytes: bytes,
    filename: str,
    content_type: str,
    subject: str,
) -> OcrQuestionResponse:
    timeout = _timeout()
    headers = {
        "Authorization": f"Bearer {settings.vivo_app_key}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "image": base64.b64encode(image_bytes).decode("utf-8"),
        "pos": settings.vivo_ocr_pos,
        "businessid": f"aigc{settings.vivo_app_id}",
    }

    with httpx.Client(timeout=timeout, trust_env=settings.vivo_use_proxy) as client:
        response = client.post(
            settings.vivo_ocr_api_url,
            headers=headers,
            params={"requestId": str(uuid4())},
            data=data,
        )
        response.raise_for_status()
        payload = response.json()

    error_code = payload.get("error_code") if isinstance(payload, dict) else None
    if error_code not in (None, 0):
        error_msg = payload.get("error_msg", "unknown") if isinstance(payload, dict) else "unknown"
        raise ValueError(f"OCR API error {error_code}: {error_msg}")

    text = _extract_text_from_ocr_payload(payload)
    if not text:
        raise ValueError(f"OCR API returned empty text: {_preview_payload(payload)}")
    return OcrQuestionResponse(
        text=text,
        question_text=text,
        raw_text=text,
        source="ocr_fallback",
        confidence=None,
    )


def _recognize_with_structured_vision_model(
    image_bytes: bytes,
    content_type: str,
    subject: str,
) -> OcrQuestionResponse:
    mime = content_type or "image/jpeg"
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    image_url = f"data:{mime};base64,{encoded}"
    prompt = _build_vision_recognition_prompt(subject)
    content = _vision_chat_completion(image_url=image_url, prompt=prompt, max_tokens=2048)
    parsed = _parse_json_content(content)
    question_text = str(parsed.get("question_text") or parsed.get("text") or "").strip()
    user_answer = str(parsed.get("user_answer") or "").strip()
    correction_notes = str(parsed.get("correction_notes") or "").strip()
    mistake_hint = str(parsed.get("mistake_hint") or "").strip()
    raw_text = str(parsed.get("raw_text") or content).strip()

    if not question_text:
        question_text = raw_text or "请在这里确认或补充图片中的题目内容。"

    return OcrQuestionResponse(
        text=question_text,
        question_text=question_text,
        user_answer=user_answer,
        correction_notes=correction_notes,
        mistake_hint=mistake_hint,
        raw_text=raw_text,
        source="vision_structured",
        confidence=None,
    )


def _chat_completion(model: str, messages: list[dict[str, object]], max_tokens: int) -> str:
    url = f"{settings.vivo_api_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Bearer {settings.vivo_app_key}",
    }
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
        "reasoning_effort": "minimal",
        "thinking": {"type": "disabled"},
        "enable_thinking": False,
        "stream": False,
    }

    with httpx.Client(timeout=_timeout(), trust_env=settings.vivo_use_proxy) as client:
        response = client.post(
            url,
            headers=headers,
            params={"request_id": str(uuid4())},
            json=body,
        )
        response.raise_for_status()
        response_data = response.json()

    _raise_for_vivo_error(response_data, model=model, is_vision=False)
    return _extract_chat_content(response_data)


def _vision_chat_completion(image_url: str, prompt: str, max_tokens: int) -> str:
    """Call vivo image understanding with the official minimal request shape."""
    model = settings.vivo_vision_model_name
    url = f"{settings.vivo_api_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Bearer {settings.vivo_app_key}",
    }
    body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
        "temperature": 0.3,
        "max_tokens": max_tokens,
        "stream": False,
    }

    with httpx.Client(timeout=_timeout(), trust_env=settings.vivo_use_proxy) as client:
        response = client.post(
            url,
            headers=headers,
            params={"request_id": str(uuid4())},
            json=body,
        )
        response.raise_for_status()
        response_data = response.json()

    _raise_for_vivo_error(response_data, model=model, is_vision=True)
    return _extract_chat_content(response_data)


def _raise_for_vivo_error(payload: object, model: str, is_vision: bool) -> None:
    if not isinstance(payload, dict):
        return

    error = payload.get("error")
    if not isinstance(error, dict):
        return

    code = error.get("code")
    message = str(error.get("message") or "unknown error")
    if is_vision and str(code) == "1010" and "model do not support image input" in message.lower():
        raise ValueError(
            "vivo vision model does not support image input: "
            f"current VIVO_VISION_MODEL_NAME={model} may not have image-understanding "
            f"permission for this AppKey, or the model name is not an image model. "
            f"vivo error {code}: {message}"
        )

    raise ValueError(f"vivo API error {code}: {message}")


def _extract_chat_content(payload: object) -> str:
    if isinstance(payload, str):
        return payload
    if not isinstance(payload, dict):
        raise ValueError(f"vivo response is not a JSON object: {_preview_payload(payload)}")

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message")
            if isinstance(message, dict) and isinstance(message.get("content"), str):
                return message["content"]
            if isinstance(first.get("content"), str):
                return first["content"]
            if isinstance(first.get("text"), str):
                return first["text"]

    for key in ("content", "text", "result", "answer", "output"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
        if isinstance(value, dict):
            nested = _extract_text_from_ocr_payload(value)
            if nested:
                return nested

    data = payload.get("data")
    if isinstance(data, dict):
        nested = _extract_text_from_ocr_payload(data)
        if nested:
            return nested

    raise ValueError(f"vivo response missing text content: {_preview_payload(payload)}")


def _preview_payload(payload: object, limit: int = 800) -> str:
    try:
        text = json.dumps(payload, ensure_ascii=False)
    except TypeError:
        text = str(payload)
    return text[:limit]


def _build_vision_recognition_prompt(subject: str) -> str:
    return f"""
请直接理解这张错题图片，并只返回合法 JSON，不要输出 Markdown、解释或前后缀。

任务：
1. 识别印刷题干、选项、已知条件、要求解的问题。
2. 识别学生的手写作答、答案、关键计算步骤。
3. 识别红笔批改、打叉、圈画、老师批注、草稿痕迹。
4. 给出一个简短的初步错因线索，说明可能错在概念、公式、计算、审题、方法或表达哪里。
5. 数学题要尽量保留表达式结构，例如 x^2、a^n、a_n、sqrt(x)、1/2、(x-1)^2、分式、根号、上下标和括号。
6. 无法确定的字段返回空字符串，不要编造。

JSON 格式：
{{
  "question_text": "题干、选项、公式和问题目标",
  "user_answer": "学生作答或关键错误步骤",
  "correction_notes": "批改痕迹、红笔标注、老师提示或草稿说明",
  "mistake_hint": "初步判断的错误位置或错误类型",
  "raw_text": "你从图片中读到的原始文字和公式"
}}

学科提示：{subject}
""".strip()


def _build_analysis_prompt(payload: AnalyzeQuestionRequest) -> str:
    recognition_context = ""
    if payload.correction_notes or payload.mistake_hint or payload.raw_recognition_text:
        recognition_context = f"""

图片识别阶段的辅助线索：
批改/草稿痕迹：{payload.correction_notes or "未识别到"}
初步错因线索：{payload.mistake_hint or "未识别到"}
识别原文：{payload.raw_recognition_text or "未提供"}
""".rstrip()

    return f"""
请分析下面这道错题，并返回严格 JSON。

要求：
1. 支持数学、英语、物理、化学、生物、语文等多学科。
2. 面向学生，用通俗语言说明错因。
3. knowledge_points 返回 1 到 5 个知识点。
4. error_type 从以下类型中选一个或给出贴切短语：概念理解、公式记忆、计算失误、审题偏差、方法选择、语法规则、表达规范、知识迁移。
5. recommended_exercises 返回 3 道同类小测题。
6. weakness_score 返回 0 到 100 的整数，分数越高代表越薄弱。
7. difficulty 返回 基础 / 中等 / 较难。
8. next_actions 返回 2 到 4 个下一步学习动作。

JSON 格式：
{{
  "subject": "数学",
  "chapter": "章节名称",
  "knowledge_points": ["知识点1", "知识点2"],
  "error_type": "概念理解",
  "error_reason": "错误原因",
  "solution": "正确思路",
  "review_outline": ["复习建议1", "复习建议2"],
  "recommended_exercises": [
    {{"title": "练习题", "answer": "答案", "explanation": "解析"}},
    {{"title": "练习题", "answer": "答案", "explanation": "解析"}},
    {{"title": "练习题", "answer": "答案", "explanation": "解析"}}
  ],
  "weakness_score": 80,
  "difficulty": "中等",
  "mastery_hint": "掌握状态判断",
  "next_actions": ["下一步1", "下一步2"]
}}

题目内容：
{payload.question_text}

用户作答：
{payload.user_answer or "未提供"}

学科：
{payload.subject}
{recognition_context}
""".strip()


def _extract_text_from_ocr_payload(payload: object) -> str:
    if isinstance(payload, str):
        return payload.strip()
    if not isinstance(payload, dict):
        return ""

    result = payload.get("result")
    if isinstance(result, dict):
        words = _extract_words_from_items(result.get("words"))
        if words:
            return words
        ocr = _extract_words_from_items(result.get("OCR"))
        if ocr:
            return ocr

    for key in ("text", "result", "words", "content", "ocrText"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    lines: list[str] = []
    for key in ("data", "items", "results", "words_result"):
        value = payload.get(key)
        extracted = _extract_words_from_items(value)
        if extracted:
            lines.append(extracted)
    return "\n".join(lines).strip()


def _extract_words_from_items(value: object) -> str:
    if not isinstance(value, list):
        return ""

    lines: list[str] = []
    for item in value:
        if isinstance(item, dict):
            word = item.get("words") or item.get("text") or item.get("content")
            if word:
                lines.append(str(word))
        elif isinstance(item, str):
            lines.append(item)
    return "\n".join(lines).strip()


def _parse_json_content(content: str) -> dict[str, object]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", content)
        if not match:
            raise ValueError(f"vivo model did not return JSON: {content[:200]}")
        return json.loads(match.group(0))


def _ensure_str_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _parse_exercises(value: object) -> list[RecommendedExercise]:
    if not isinstance(value, list):
        return []

    exercises: list[RecommendedExercise] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        exercises.append(
            RecommendedExercise(
                title=str(item.get("title") or "同类练习"),
                answer=str(item.get("answer") or "待解析"),
                explanation=str(item.get("explanation") or "模型未返回解析。"),
            )
        )
    return exercises[:3]


def _normalize_score(value: object) -> int:
    try:
        score = int(value)
    except (TypeError, ValueError):
        score = 70
    return max(0, min(100, score))


def _timeout() -> httpx.Timeout:
    return httpx.Timeout(
        settings.vivo_timeout_seconds,
        connect=20,
        read=settings.vivo_timeout_seconds,
        write=20,
        pool=20,
    )
