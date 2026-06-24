# emotion-companion · 会记得你的情绪陪伴

中文情感陪伴 AI。基座大模型 + RAG 检索增强 + 跨会话长期记忆 + 共情 Prompt 工程 + 危机护栏。

**定位**:健康、合规、克制的情绪陪伴。核心卖点 —— *记得你说过的每件事*。
**不做**:抽卡氪金、先养感情再卡付费墙、擦边人设、最大化时长 KPI。

## 为什么是这个产品

赛道 2025 已断崖洗牌(头部下载普跌 80%),死因是失忆 + 人设漂移 —— **留存而非拉新是护城河**。
共情质量不靠基座原生,靠 RAG 记忆 + 后训练对齐(7B 小模型可逼近 GPT-4o)。详见 [`docs/research-report.md`](docs/research-report.md)。

## 架构

见 [`docs/architecture.md`](docs/architecture.md)。一句话技术栈:

> bge-m3 + bge-reranker-v2-m3 → pgvector(原型)/Qdrant(上线) + mem0 记忆 + DeepSeek/Qwen 基座 + Next.js/AI SDK + 危机检测双层(关键词 + Chinese MentalBERT)。全部 Apache/MIT 可商用。

## 目录

```
apps/web/         Next.js 聊天 UI(AI SDK 流式 + 记忆面板)
packages/
  core/           对话编排 Orchestrator
  rag/            bge-m3 检索 + reranker
  memory/         mem0 跨会话长期记忆
  safety/         危机检测双层 + 合规护栏(一票否决)
  prompts/        共情 Prompt / Context 工程
server/           FastAPI:embedding/reranker/危机分类器/mem0 后端
  data_pipeline/  采集→清洗→合规过滤→入库
  training/       7B 共情后训练(LoRA)
  eval/           RAGAS + 共情 + 危机召回率评测
data/             raw / processed / seed(合规种子语料)
```

## 快速开始

```bash
pnpm install
cp .env.example .env        # 填 LLM_API_KEY 等
docker compose up -d        # 起 postgres(pgvector) + qdrant
pnpm --filter server dev    # Python 服务
pnpm --filter web dev       # 前端 → http://localhost:3000
```

## 合规

上线前必读 [`docs/compliance.md`](docs/compliance.md)。三条底线:未成年人一票否决 + 危机人工兜底;训练数据不踩版权/PIPL;强制透明防沉迷 + 不做情感操纵。
