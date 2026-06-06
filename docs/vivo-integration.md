# vivo AIGC 接入说明

开发文档入口：https://aigc.vivo.com.cn/#/document/index?id=1746

## 能力匹配

- 视觉模型：优先理解错题图片中的题干、数学公式、学生作答、批改痕迹和初步错因线索。
- 通用 OCR：作为兜底识别图片中的文字。
- 大模型：分析错因、映射知识点、生成讲解、复习提纲和练习题。
- 视觉模型：当 OCR 接口不可用时，使用图片理解能力兜底提取题目文字。

## 大模型接口

文本生成大模型接口兼容 OpenAI Chat Completions 格式：

- 地址：`https://api-ai.vivo.com.cn/v1/chat/completions`
- 方法：`POST`
- 鉴权：请求头 `Authorization: Bearer AppKey`
- 请求参数：query 中传 `request_id`
- 常用模型：`Doubao-Seed-2.0-mini`、`Doubao-Seed-2.0-lite`、`Doubao-Seed-2.0-pro`、`Volc-DeepSeek-V3.2`、`qwen3.5-plus`

## 本地配置

在 `backend/.env` 中填写：

```env
VIVO_APP_ID=你的AppID
VIVO_APP_KEY=你的AppKEY
VIVO_API_BASE_URL=https://api-ai.vivo.com.cn/v1
VIVO_MODEL_NAME=Doubao-Seed-2.0-mini
VIVO_VISION_MODEL_NAME=Volc-DeepSeek-V3.2
VIVO_OCR_API_URL=
VIVO_OCR_MODE=auto
VIVO_USE_MOCK=false
VIVO_USE_PROXY=false
VIVO_TIMEOUT_SECONDS=120
APP_ENV=development
```

图片识别默认优先走视觉模型。`VIVO_OCR_API_URL` 配置为通用 OCR 地址时，视觉模型失败后会自动使用 OCR 兜底。
