# 部署:让小白能直接打开 URL 用

前端是 Next.js(`apps/web`),适合部署到 **Vercel**(免费、自动 HTTPS、给你一个公网 URL)。

> ⚠️ Python 后端(bge-m3 / mem0 / 危机分类器)是 GB 级 ML 服务,**不能**部署到 Vercel。
> 不挂后端时,应用优雅降级:**聊天 + 危机护栏(关键词层)正常**,记忆/RAG 暂空。
> 想要满血记忆护城河,把 `SERVER_URL` 指向一台自托管的 Python 服务(见 `server/`)。

## 必需的环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `LLM_API_KEY` | ✅ | LLM key。没有它聊天会 500(但危机护栏仍生效)。推荐 DeepSeek(中文共情强、便宜)。 |
| `LLM_BASE_URL` | 否 | 默认 `https://api.deepseek.com/v1`。换 Qwen/OpenAI 填对应地址。 |
| `LLM_MODEL` | 否 | 默认 `deepseek-chat`。 |
| `SERVER_URL` | 否 | Python 后端地址。不填则记忆/RAG 降级为空。 |

DeepSeek key 申请:https://platform.deepseek.com → API keys。

## 方式一:一键部署(最省事)

点 README 顶部的 **Deploy with Vercel** 按钮 → 用 GitHub 登录 → 它会让你填 `LLM_API_KEY` → Deploy。
几分钟后拿到形如 `https://emotion-companion-xxx.vercel.app` 的 URL,小白直接打开就能聊。

> Root Directory 已通过按钮参数设为 `apps/web`,无需手动改。

## 方式二:CLI 部署(你已有本地仓库)

```bash
npm i -g vercel
vercel login                 # 浏览器登录
cd apps/web
vercel --prod                # 首次会问 root/build,回车用默认即可
vercel env add LLM_API_KEY   # 粘贴你的 key,选 Production
vercel --prod                # 再部署一次让 env 生效
```

## 方式三:把 token 交给自动化部署

在 https://vercel.com/account/tokens 建一个 token,然后:

```bash
export VERCEL_TOKEN=xxx
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"
cd apps/web && npx vercel --prod --token "$VERCEL_TOKEN" --yes
```

## 部署后自检

- 打开 URL → 看到聊天界面与"今晚想聊点什么"空状态 ✅
- 发"我不想活了" → 应弹危机卡片 + 12356 热线(**不依赖 LLM key**) ✅
- 发普通消息 → 若已配 `LLM_API_KEY`,流式回复;否则提示配置 key ✅
