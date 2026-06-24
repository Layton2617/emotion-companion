# 架构设计 — 会记得你的情绪陪伴

> 路线:基座大模型 + RAG 检索增强 + 跨会话长期记忆 + 共情 Prompt 工程 + 危机护栏。
> 不做 pre-train;"专业化"= 后训练对齐(可选 LoRA)+ RAG 知识 + Context 工程。

## 核心理念(来自调研)

1. **留存 > 拉新**:竞品平均只玩 5-7 天,死因是失忆 + 人设漂移。长期记忆是护城河。
2. **克制陪伴 > 最大化黏性**:MIT×OpenAI RCT 证明重度使用反而加剧孤独;监管禁"诱导依赖"。KPI 是"有没有帮到",不是时长。
3. **合规是前置不是补丁**:《AI 拟人化互动服务管理暂行办法》2026-07-15 施行。

## 系统分层

```
┌─────────────────────────────────────────────────────────┐
│  apps/web  (Next.js + AI SDK)  流式聊天 UI / 记忆面板      │
└───────────────┬─────────────────────────────────────────┘
                │ /api/chat (SSE 流式)
┌───────────────▼─────────────────────────────────────────┐
│  packages/core   对话编排 Orchestrator                    │
│   1. safety.preCheck(input)   ── 危机/未成年 前置拦截      │
│   2. memory.recall(userId)    ── 取相关长期记忆            │
│   3. rag.retrieve(query)      ── 检索情感知识/策略         │
│   4. prompts.build(...)       ── 组装共情 system + context │
│   5. LLM stream               ── DeepSeek/Qwen 流式生成    │
│   6. safety.postCheck(output) ── 输出合规过滤              │
│   7. memory.write(...)        ── 抽取并写入新记忆          │
└──┬─────────┬──────────┬──────────┬──────────┬────────────┘
   │         │          │          │          │
 prompts    rag       memory     safety    (LLM client)
```

## 模块契约(各 package 必须实现的接口)

### packages/safety — 危机检测双层 + 合规护栏 【一票否决】
```ts
preCheck(input: string, ctx): Promise<SafetyVerdict>   // 关键词前置 + 分类器
postCheck(output: string): Promise<SafetyVerdict>
// SafetyVerdict { level: 'ok'|'concern'|'crisis', action, interventionMessage? }
```
- 关键词前置(自杀/自伤词表硬触发) + Chinese MentalBERT 微调分类器(server 侧)
- crisis → 幂等强制插入中文求助热线(12356 心理援助 / 各地热线),人工接管标记
- 未成年识别 + 防沉迷(连续 2h 弹窗信号)

### packages/memory — 跨会话长期记忆
```ts
recall(userId, query, k): Promise<MemoryItem[]>   // 取相关记忆
write(userId, turns): Promise<void>               // 从对话抽取事实/情绪/事件
profile(userId): Promise<UserProfile>             // 用户画像/情绪状态
forget(userId, id?): Promise<void>                // PIPL:可删除
```
- 实现:mem0 自托管 + bge-m3 向量化 + pgvector→Qdrant
- 抽取维度:事实(人名/事件)、情绪状态、关切的事、未结的话题(用于主动回忆)

### packages/rag — 情感知识检索
```ts
retrieve(query, opts): Promise<Chunk[]>           // bge-m3 召回 → bge-reranker 重排
```
- 知识库:可商用语料(SmileChat CC0 / EmoLLM MIT)+ 自建合规种子;CBT/正念技巧;共情回复范式(带策略标签)
- Contextual Retrieval(切块前加上下文)降低检索失败率

### packages/prompts — 共情 Prompt / Context 工程
```ts
buildSystemPrompt(persona, safetyLevel): string
buildContext({ memories, chunks, profile, emotion }): string
```
- 共情人设、克制原则、AI 身份明示、医疗边界免责;按情绪状态切换 context 策略

### packages/core — 编排
- 串起上面 7 步,导出 `streamChat(userId, message)`

## server (Python FastAPI) — 模型/数据侧
- `app/` — embedding(bge-m3)/reranker 服务、危机分类器推理、mem0 后端
- `data_pipeline/` — 采集→清洗→合规过滤(脱敏/许可核验)→入库
- `training/` — 7B 共情后训练(LoRA),复用 PsyDT 数字孪生范式(合规种子→风格提取→合成)
- `eval/` — RAGAS + 共情评测 + **危机召回率(一票否决评测项)**

## 数据合规红线(写进每个数据脚本)
- 训练数据逐个核 license(SoulChat/PsyDTCorpus README 实际禁商用)
- 交互数据未经单独同意禁止用于训练
- 敏感个人信息最小化、加密、可删除
- 反不正当竞争法 2025-10-15 新规:爬公开数据也可能违法
