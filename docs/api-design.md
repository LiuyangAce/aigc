# API 设计

## POST /api/ocr-question

识别错题图片。

请求：`multipart/form-data`

- `image`：图片文件
- `subject`：可选学科，默认 `通用`

响应：

```json
{
  "text": "识别出的题干",
  "source": "ocr",
  "confidence": null
}
```

当专门 OCR 不可用时，`source` 返回 `vision_fallback`。

## POST /api/analyze-question

分析一道错题。

请求：

```json
{
  "question_text": "已知函数 f(x)=x^2-2x，求最小值",
  "user_answer": "2",
  "subject": "数学"
}
```

响应：

```json
{
  "id": "q-demo-001",
  "subject": "数学",
  "chapter": "函数",
  "knowledge_points": ["二次函数", "配方法", "函数最值"],
  "error_type": "概念理解",
  "error_reason": "把函数最小值和取得最小值时的 x 混淆。",
  "solution": "f(x)=x^2-2x=(x-1)^2-1，因此最小值为 -1。",
  "review_outline": ["复习二次函数顶点式", "区分最值与取值点"],
  "recommended_exercises": [],
  "weakness_score": 80,
  "difficulty": "中等",
  "mastery_hint": "需要复习二次函数最值。",
  "next_actions": ["完成小测", "收藏错题"]
}
```

## GET /api/knowledge-graph

获取演示知识图谱节点和边。真实累计图谱由前端根据本地错题历史动态生成。

