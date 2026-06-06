# Render 生产环境配置

服务名称：`zhicuotupu-api`

公网地址：`https://zhicuotupu-api.onrender.com`

健康检查：`https://zhicuotupu-api.onrender.com/api/health`

Android 分析接口：`https://zhicuotupu-api.onrender.com/api/analyze-question`

## 环境变量

以下变量配置在 Render Dashboard，不要将真实密钥写入仓库：

```env
APP_ENV=production
PYTHON_VERSION=3.12.8
VIVO_APP_ID=<Render Secret>
VIVO_APP_KEY=<Render Secret>
VIVO_API_BASE_URL=https://api-ai.vivo.com.cn/v1
VIVO_MODEL_NAME=Doubao-Seed-2.0-mini
VIVO_VISION_MODEL_NAME=Doubao-Seed-2.0-mini
VIVO_USE_MOCK=false
VIVO_TIMEOUT_SECONDS=120
CORS_ORIGINS=*
```

## 发布版本

- Android 包名：`com.zhicuotupu.edge`
- Android 版本：`1.1`（versionCode `2`）
- Release 标签：`android-v1.1-demo`
- APK 文件名：`zhicuotupu-edge-cloud-v1.1-demo.apk`
- SHA256：`A044B4F2D76E7425AB8438A0EB5A72578385BDC9FB9DBC583D67C7B45F4DDA4F`

Render 免费实例闲置后会休眠。答辩演示前先访问健康检查地址，等待返回 `{"status":"ok"}`。
