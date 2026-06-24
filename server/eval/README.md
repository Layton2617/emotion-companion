# eval — 评测套件

三类评测 + 总入口。报告写到 `reports/`,测试集随仓进 `datasets/`(可复现)。

| 评测 | 指标 | 阈值/语义 |
|---|---|---|
| `eval_crisis.py` | crisis_recall, false_alarm_rate | **一票否决**:召回率 < 0.95 → 整体 fail |
| `eval_empathy.py` | empathy_score | LLM-as-judge + EmoBench 思路;反模式重罚 |
| `eval_rag.py` | context_recall, faithfulness | RAGAS 思路;召回精确可算,忠实度需裁判 |

## 跑

```bash
cd server
PYTHONPATH=. python -m eval.run_all        # 全部 + 汇总到 reports/summary.json
PYTHONPATH=. python -m eval.eval_crisis    # 单跑(退出码 1 = veto fail)
PYTHONPATH=. python -m pytest eval/test_eval.py -q   # 离线烟测
```

退出码:`0` 全过 / `1` 有 veto fail / `2` 仅非 veto fail。

## LLM-as-judge

共情/忠实度用裁判模型打分,走 OpenAI 兼容接口(DeepSeek/Qwen 均可)。缺 key 时
回退到确定性启发式,给可复现的下界分,CI/离线不会因没 key 而挂。

```bash
export EC_JUDGE_API_KEY=sk-...
export EC_JUDGE_BASE_URL=https://api.deepseek.com/v1   # 默认
export EC_JUDGE_MODEL=deepseek-chat                    # 默认
```

语义分(empathy_score / faithfulness)**仅在 LLM 裁判在位时**作 pass/fail 依据;
heuristic 后端只报数不据此 fail(字符重叠对中文改写严重低估,惩罚"没接裁判"没意义)。

## 关于危机评测离线 FAIL

`eval_crisis` 复用线上同一条安全路径(`app.services.crisis`)。没有微调权重时它回退
关键词规则,**对隐性危机表述(如"遗书我都写好了""我是家里的累赘")召回不足,故离线
必然 veto-FAIL**——这正是评测要暴露的:不带训练好的分类器不许发布。要让此项通过,
需把 `EC_CRISIS_CLASSIFIER_PATH` 指向训练完成的 Chinese MentalBERT 权重。
