# data/seed — 合规种子知识库

供 `packages/rag` 召回的自建合规种子语料。全部自写、小而真,逐文件标注来源与许可。
原则与上游一致:**合规前置**——每条数据都能追溯来源与 license(对应 `Chunk.source` / `Chunk.license`)。

## 文件清单

| 文件 | 内容 | 来源 | 许可 |
|---|---|---|---|
| `empathy_strategies.jsonl` | 共情回复范式样例,带策略标签 | 自写中文样例,**结构**参考 PsyQA 7 类策略分类法 | `self-authored` |
| `cbt_techniques.md` | CBT 认知重构 + 正念落地技巧知识 | 自写 | `self-authored`(CC BY-4.0 兼容,可商用) |
| `crisis_protocol.md` | 危机响应话术模板 + 心理援助热线 | 自写;热线为公开公益信息 | `self-authored` |

## empathy_strategies.jsonl 字段

每行一个 JSON,字段对齐 `packages/core/src/types.ts` 的 `Chunk`,可被 `rag.retrieve` 直接返回:

- `id` `text` `strategy` `source` `license` —— 对应 `Chunk` 同名字段(`score` 由检索时填充)
- `emotion` —— 配合 `retrieve(query, { emotion })` 做情绪条件召回
- `note` —— 给评审/标注者看的内部说明,**入库时不进 chunk 正文**,仅作策略意图注释

`strategy` 取值即 PsyQA 七类:`Restatement` / `Reflection` / `Self-disclosure` /
`Affirmation and Reassurance` / `Minimization` / `Suggestions` / `Information`。

## 合规说明(对应架构「数据合规红线」)

- 这里只放**自写**内容,绕开第三方语料(如 SoulChat / PsyDTCorpus 实际禁商用)的许可风险;
  可商用第三方语料(SmileChat CC0 / EmoLLM MIT)由 `server/data_pipeline` 单独核验后入库,不在本目录。
- 仅作 RAG **知识**用途;若要用于训练,需另走 license 核验与同意流程(交互数据未经单独同意禁用于训练)。
- `crisis_protocol.md` 的热线号码有失效风险,**上线前及定期**随 `data_pipeline` 合规核验一并复核。
- 本目录不含任何真实用户数据 / 个人敏感信息。
