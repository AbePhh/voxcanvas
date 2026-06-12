# voxcanvas
纯语音控制的 AI 绘图工具，支持通过自然语言指令创建、编辑和管理画布图形。

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Set `DEEPSEEK_API_KEY` in `.env` to enable the AI command planner. The API key is only used by the local Node server and is not exposed to the browser.

## Scripts

```bash
npm run dev
npm run test
npm run lint
npm run build
```
