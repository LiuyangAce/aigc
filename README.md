# 知错图谱

面向中国高校计算机大赛 AIGC 应用赛道复赛的多学科错题学习闭环应用。

知错图谱围绕“错题驱动学习”构建完整流程：用户拍照或上传错题后，系统识别题目内容，调用 vivo 蓝心大模型分析错因，映射知识点，动态更新知识图谱，并生成复习提纲与小测练习。复赛版采用“移动 App 感 Web 应用 + FastAPI 后端”的可运行形态，可部署为公开体验链接，也方便后续迁移为 vivo 手机 App、快应用或 WebView。

## 核心功能

- 拍题识别：上传题目图片，优先用蓝心视觉模型理解题干、学生作答和批改痕迹，OCR 作为兜底。
- 多学科分析：支持数学、英语、物理、化学、生物、语文和通用题目。
- 错因诊断：输出章节、知识点、错因类型、正确思路、薄弱分和下一步建议。
- 动态图谱：按历史错题累计知识点权重，红/橙/蓝展示薄弱程度。
- 错题本：支持按学科、错因和知识点筛选历史错题。
- 复习小测：根据薄弱知识点生成练习，答题结果反向修正薄弱分。
- AI 能力链路：在界面中展示 OCR/视觉识别、蓝心分析、知识映射、复习生成的调用状态。
- 本地持久化：错题、图谱和复习记录保存到 `localStorage`，刷新后仍保留。

## 技术栈

- 前端：Vue 3 + Vite + ECharts
- 后端：FastAPI + Pydantic + httpx
- AI 能力：vivo 蓝心大模型 Chat Completions、视觉模型图片理解、可选 OCR 接口
- 数据：浏览器本地存储，不接数据库，便于公开体验链接快速运行
- 部署：前端支持 Netlify / Vercel，后端支持 Render / Railway

## 本地运行

后端：

```powershell
cd backend
copy .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

前端：

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

前端默认访问 `http://localhost:5173`，后端默认访问 `http://localhost:8000`。

## 后端环境变量

复制 `backend/.env.example` 为 `backend/.env`，并填写自己的 vivo AppID / AppKEY：

```env
VIVO_APP_ID=你的AppID
VIVO_APP_KEY=你的AppKEY
VIVO_API_BASE_URL=https://api-ai.vivo.com.cn/v1
VIVO_MODEL_NAME=Doubao-Seed-2.0-mini
VIVO_VISION_MODEL_NAME=Volc-DeepSeek-V3.2
VIVO_OCR_API_URL=http://api-ai.vivo.com.cn/ocr/general_recognition
VIVO_OCR_MODE=auto
VIVO_OCR_POS=2
VIVO_USE_MOCK=false
VIVO_USE_PROXY=false
VIVO_TIMEOUT_SECONDS=120
CORS_ORIGINS=http://localhost:5173,https://your-frontend-domain.netlify.app
APP_ENV=development
```

图片识别默认优先使用蓝心视觉模型，适合数学公式、手写作答和批改痕迹理解。`VIVO_OCR_API_URL` 配置为 vivo 通用 OCR 地址时，会作为视觉模型失败后的兜底。

`VIVO_USE_MOCK=false` 时会真实调用 vivo 蓝心大模型；`VIVO_USE_MOCK=true` 时使用内置演示分析结果，适合作为现场兜底。

## 复赛部署与提交

复赛要求作品必须可运行。本项目推荐提交：

- 公开体验链接：前端部署到 Netlify / Vercel。
- 后端 API：部署到 Render / Railway，并通过环境变量保存 vivo AppKey。
- 部署说明：见 `docs/fusai-deployment.md`。
- 代码包：可全量提交，也可重点标注 `backend/app/services/vivo_ai.py` 中的大模型 API 调用部分。

前端线上环境变量：

```env
VITE_API_BASE_URL=https://你的后端域名
```

后端线上环境变量至少需要：

```env
VIVO_APP_KEY=你的AppKey
VIVO_USE_MOCK=false
CORS_ORIGINS=https://你的前端域名
```

## API

- `GET /api/health`：健康检查。
- `GET /api/questions`：获取演示错题。
- `GET /api/knowledge-graph`：获取演示知识图谱。
- `POST /api/ocr-question`：上传图片并识别题干。
- `POST /api/analyze-question`：分析错题并返回错因、图谱节点和复习建议。
