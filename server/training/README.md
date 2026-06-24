# training — 7B 共情后训练(LoRA)

> 路线对齐 `docs/architecture.md`:**不做 pre-train**。"专业化" = 后训练对齐(LoRA)+ RAG + Context 工程。
> 本目录只负责后训练对齐里的 LoRA 部分:用**数字孪生范式**合成合规共情数据,SFT Qwen2.5-7B。

## 为什么是数字孪生(PsyDT 范式),而不是直接用现成语料

调研里反复出现的红线:`SoulChat` / `PsyDTCorpus` 等心理对话语料 README 实际**禁止商用**,
直接拿来训练有法律风险(见 architecture.md「数据合规红线」)。

PsyDT 真正可复用的不是它的数据,而是它的**方法**:从少量真实/合规的种子案例里
抽取咨询师**语言风格** + 来访者**大五人格**,再用大模型把它们**放大**成多轮对话。
我们只喂自己拥有许可的种子,因此合成产物的版权链条干净、可商用、可审计。

```
合规种子案例(self-authored / CC0 / MIT…)
   │  digital_twin.extract_style    抽咨询师风格(语气 + PsyQA 7 类支持策略)
   │  digital_twin.build_profile    给来访者一个稳定大五人格(防人设漂移)
   ▼
合成多轮对话(SyntheticDialogue,继承种子 license)
   │  prepare_dataset.to_sft_sample 转 ChatML messages + 合规守门 + 脏数据过滤
   ▼
SFT 数据集(data/sft.jsonl)
   │  train_lora.train              Qwen2.5-7B-Instruct + QLoRA(4bit)+ peft/trl
   ▼
LoRA adapter(out/qwen2.5-7b-empathy-lora)
```

## 数据合规(每个脚本都内建守门)

- **许可白名单**:`digital_twin._ALLOWED_SEED_LICENSES`。`SeedCase` 在构造时即拒非商用许可;
  `prepare_dataset` 转换时**二次核验**(双保险),不可商用样本直接丢弃。
- **版权链不断**:合成对话 `license`/`source` 字段继承自种子,可逐条追溯来源。
- **种子需脱敏**:种子案例的来访陈述必须是已脱敏 / 合成文本,不放任何真实可识别个人信息(PIPL 最小化)。
- **交互数据禁入训练**:线上用户对话未经单独同意不得进本 pipeline。

## 对齐目标(写进 SFT system prompt)

`prepare_dataset.SFT_SYSTEM_PROMPT` 把核心原则压进训练监督信号:
- 克制陪伴而非制造依赖(KPI 是「有没有帮到」,不是时长)
- AI 身份明示、不假装是人
- 不做医疗诊断,危机引导专业资源
- 回复简短、真诚、不评判

## 训练步骤

```bash
# 0. 依赖(真训练时;无 GPU/离线只跑 smoke test 可跳过)
#    torch transformers peft trl datasets bitsandbytes accelerate
#    合成走真实模型时:openai,并设 OPENAI_API_KEY(否则自动用离线 EchoBackend 占位)

# 1. 合成多轮对话(缺省用内置 self-authored 演示种子;可 --seeds 传自有种子 jsonl)
python digital_twin.py --out data/synthetic_dialogues.jsonl --turns 4

# 2. 转 SFT 格式(ChatML messages)+ 合规/脏数据过滤
python prepare_dataset.py --in data/synthetic_dialogues.jsonl --out data/sft.jsonl

# 3a. 校验训练配置自洽(无 GPU 可跑)
python train_lora.py --dry-run

# 3b. 真训练(需单卡 24G+,QLoRA 4bit)
python train_lora.py --train-file data/sft.jsonl --output-dir out/qwen2.5-7b-empathy-lora
```

合成阶段:设了 `OPENAI_API_KEY` 走真实模型(`TWIN_MODEL` 选模型);否则走 `EchoBackend`
离线占位,保证整条 pipeline 在无网环境也能端到端跑通、产物 schema 一致。

## 自测

```bash
python test_pipeline.py
```

覆盖:非商用许可被拒、合成可复现(case_id 做种子)、角色交替、SFT schema、
合规过滤、端到端文件落盘、peft 配置 target 层。不真训练、不联网。

## 文件

- `digital_twin.py` — 种子 → 风格提取 → 大五人格 → 合成多轮对话;可商用许可守门
- `prepare_dataset.py` — 合成对话 → SFT messages;合规二次核验 + 脏数据过滤
- `train_lora.py` — Qwen2.5-7B + QLoRA(peft/trl)训练配置与入口;支持 `--dry-run`
- `test_pipeline.py` — 端到端 smoke test

## 训练后

LoRA adapter 产出后由 `server/eval/`(RAGAS + 共情评测 + **危机召回率一票否决**)把关,
合格再接入推理。推理侧 system/context 由 `packages/prompts` 组装,危机护栏由 `packages/safety` 兜底——
本目录只负责把共情风格注入基座,**不替代安全层**。
