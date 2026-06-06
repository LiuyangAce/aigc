# 知错图谱端云协同识题 MVP

基于赛事官方 `BlueLM_V_3B` 多模态 Demo 改造的 Android MVP。图片在 vivo 设备本地完成 VIT 编码与文字提取，确认后的结构化文字可交给 FastAPI + 豆包完成深度诊断。

## 当前能力

- 固定使用多模态模型路径 `/sdcard/1225/1.7.0.4_1225_mtk9500`
- 应用启动后在后台初始化 `BlueLM_V_3B`
- 选择错题图片后修正 EXIF 方向，并将最大边缩放至 1280 像素
- 将图片转换为 RGB 后调用 `callVit()`
- 使用 512 个生成 Token 提取题干、学生作答候选、批改痕迹与原始文字
- 明确禁止端侧模型判断答案正确性或生成错因
- 从模型输出中提取 JSON，并提供可编辑的结果确认界面
- 确认后调用现有 `/api/analyze-question` 接口，由豆包完成验算、错因诊断与学习建议
- 无网络时可将确认结果保存在本机，并在下次启动时恢复
- 支持重新识别、中断推理、错误码提示与资源释放

## 端云职责

```text
BlueLM_V_3B：图片理解、文字提取、视觉线索描述
用户确认：修正题目和学生作答候选
FastAPI + 豆包：答案验算、错因诊断、知识点与下一步建议
```

在应用中的“豆包分析接口”填写公网后端完整地址，例如：

```text
https://your-api.example.com/api/analyze-question
```

本地真机联调时也可填写电脑局域网地址。云真机无法访问电脑的 `localhost`。

## 工程要求

- JDK 17
- Android SDK 34
- Android NDK
- CMake 3.22.1
- arm64-v8a vivo 比赛设备

命令行构建：

```powershell
cd android-app
.\gradlew.bat :app:assembleDebug
```

APK 产物：

```text
app/build/outputs/apk/debug/app-debug.apk
```

## vivo 云真机安装

比赛云真机会拦截通过 `adb install` 或 `pm install` 发起的安装。请在云真机网页右侧使用：

1. 打开“应用”页的“包体上传”。
2. 上传 `app/build/outputs/apk/debug/app-debug.apk`。
3. 上传完成后，在历史记录中点击“安装”。
4. 在手机画面中允许“管理所有文件”，以读取内置模型。

安装后可使用 ADB 启动和查看日志：

```powershell
adb -s 云真机地址 shell am start -n com.zhicuotupu.edge/.MainActivity
adb -s 云真机地址 logcat -s LlmJni AndroidRuntime
```

## 测试图片

```powershell
adb -s 云真机地址 push ..\pic_err\math\0.png /sdcard/Pictures/question.png
adb -s 云真机地址 shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/question.png
```

云真机上应同时存在模型目录：

```text
/sdcard/1225/1.7.0.4_1225_mtk9500
```

## 文本审核

`PlaceholderTextSafetyGate` 仅用于预留审核接口，目前只拒绝空文本，不满足赛事正式文本审核要求。取得官方审核能力后，应替换该实现，并同时审核推理输入与输出。

## 目录说明

- `app/`：知错图谱 MVP 业务层
- `llm-sdk/`：从官方 Demo 复制的多模态 SDK、JNI 桥接和原生依赖
- `../guanfang/demo/`：官方原始参考工程，保持不修改
