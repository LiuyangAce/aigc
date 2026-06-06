# 知错图谱复赛部署与提交说明

## 交付形态

知错图谱复赛版采用“移动 App 感 Web 应用 + FastAPI 后端”的可运行形态：

- 前端：Vue 3 + Vite + ECharts，部署为公开体验链接。
- 后端：FastAPI，部署为线上 API 服务，代理调用 vivo 蓝心大模型。
- 数据：学习记录保存在浏览器 `localStorage`，便于评委打开链接后直接体验完整闭环。
- 兜底：`VIVO_USE_MOCK=true` 时使用内置演示数据，避免现场网络或模型服务波动导致演示中断。

## 大模型调用链路

复赛材料中需要重点标注以下代码位置：

- 图片识别入口：`backend/app/api/routes.py` 的 `POST /api/ocr-question`，内部优先走蓝心视觉模型结构化理解
- 错题分析入口：`backend/app/api/routes.py` 的 `POST /api/analyze-question`
- vivo 蓝心 API 核心封装：`backend/app/services/vivo_ai.py`
- 前端调用入口：`frontend/src/api.js`
- 前端可视化展示：`frontend/src/App.js` 的“AI 能力链路”

真实调用流程：

1. 用户上传错题图片或手动输入题目。
2. 前端调用后端 `/api/ocr-question`。
3. 后端优先调用蓝心视觉模型，结构化返回题干、学生作答、批改痕迹和初步错因线索。
4. 用户确认后调用 `/api/analyze-question`。
5. 后端结合题干、作答和识别线索调用蓝心文本模型，返回最终错因、知识点、薄弱分、复习提纲和练习题。
6. 前端更新知识图谱、错题本和复习小测。

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

默认访问：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8000`
- 健康检查：`http://localhost:8000/api/health`

## 后端环境变量

生产环境建议配置：

```env
VIVO_APP_ID=你的AppID
VIVO_APP_KEY=你的AppKey
VIVO_API_BASE_URL=https://api-ai.vivo.com.cn/v1
VIVO_MODEL_NAME=Doubao-Seed-2.0-mini
VIVO_VISION_MODEL_NAME=Volc-DeepSeek-V3.2
VIVO_OCR_API_URL=http://api-ai.vivo.com.cn/ocr/general_recognition
VIVO_OCR_MODE=auto
VIVO_OCR_POS=2
VIVO_USE_MOCK=false
VIVO_USE_PROXY=false
VIVO_TIMEOUT_SECONDS=120
CORS_ORIGINS=https://你的前端域名
APP_ENV=production
```

说明：

- `VIVO_USE_MOCK=false`：真实调用 vivo 蓝心大模型。
- `VIVO_USE_MOCK=true`：使用内置演示分析结果，适合作为现场兜底。
- `CORS_ORIGINS`：支持逗号分隔，也支持 JSON 数组。
- 图片识别默认优先走蓝心视觉模型，适合数学公式、手写作答和批改痕迹理解。
- `VIVO_OCR_API_URL` 配置为 `http://api-ai.vivo.com.cn/ocr/general_recognition` 时，会按 vivo 通用 OCR 文档上传 base64 图片作为兜底。
- `VIVO_OCR_POS=2` 会同时返回文字和相对坐标信息；当前前端使用其中的文字内容填充题目输入框。
- `VIVO_OCR_API_URL` 为空时，图片识别会走蓝心视觉模型兜底。

## 免费平台部署建议

### 前端：Netlify

1. 导入本仓库。
2. 使用仓库根目录的 `netlify.toml`。
3. 配置环境变量：

```env
VITE_API_BASE_URL=https://你的-render-api域名
```

4. 部署成功后记录前端体验链接。

### 后端：Render

1. 导入本仓库。
2. 使用仓库根目录的 `render.yaml`，或手动创建 Web Service。
3. Root Directory 设为 `backend`。
4. Build Command：`pip install -r requirements.txt`
5. Start Command：`uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. 配置 vivo 相关环境变量，尤其是 `VIVO_APP_KEY` 和 `CORS_ORIGINS`。

## 复赛提交包建议

提交材料建议包含：

- 前端代码：`frontend/`
- 后端代码：`backend/`
- 策划与接口文档：`docs/`
- 部署说明：`docs/fusai-deployment.md`
- 体验链接：前端公开 URL
- 后端健康检查链接：`/api/health`
- 演示 PPT 和演示视频

答辩时建议演示路径：

1. 打开体验链接。
2. 展示“AI 能力链路”，说明大模型调用发生在后端，密钥不暴露给前端。
3. 输入一道错题并点击“AI 分析错题”。
4. 展示错因诊断、知识点映射、知识图谱更新。
5. 点击薄弱点进入复习小测，完成错题到复习的闭环。
