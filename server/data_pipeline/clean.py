"""清洗阶段 —— 去噪 + 规范化,不改变语义,不做脱敏(脱敏是 compliance 的职责)。

合规红线:
- 清洗只做格式归一,绝不能在这里"顺手"把疑似敏感信息删掉 —— 脱敏必须走
  compliance_filter 的统一规则并留审计痕迹,否则会出现"以为洗过了其实没脱敏"的盲区。
"""

from __future__ import annotations

import argparse
import re
import unicodedata

from data_pipeline.schema import Record, read_jsonl, write_jsonl

# 全角空白、零宽字符、连续空白:爬取/复制粘贴语料里高频噪声。
_ZERO_WIDTH = re.compile(r"[​-‍﻿]")
_MULTI_WS = re.compile(r"[ \t]{2,}")
_MULTI_NL = re.compile(r"\n{3,}")
# 重复标点(如"。。。。""!!!!!")收敛,长度不影响语义但污染分布。
_REPEAT_PUNC = re.compile(r"([。!?,、~.!?])\1{2,}")


def normalize_text(text: str) -> str:
    # NFKC 把全角数字/字母、兼容字符折叠成标准形,统一中英混排。
    text = unicodedata.normalize("NFKC", text)
    text = _ZERO_WIDTH.sub("", text)
    text = _REPEAT_PUNC.sub(r"\1\1\1", text)
    text = _MULTI_WS.sub(" ", text)
    text = _MULTI_NL.sub("\n\n", text)
    return text.strip()


def _is_valid(rec: Record) -> bool:
    if not rec.turns:
        return False
    # 内容全空的退化样本对训练/检索都是负价值,直接丢。
    if all(not t.content.strip() for t in rec.turns):
        return False
    return True


def clean_record(rec: Record) -> Record | None:
    for t in rec.turns:
        t.content = normalize_text(t.content)
    # 规范化后再过滤,避免"只剩零宽字符"的样本漏网。
    rec.turns = [t for t in rec.turns if t.content]
    if not _is_valid(rec):
        return None
    rec.stages.append("clean")
    return rec


def clean(in_path: str, out_path: str) -> int:
    cleaned = (c for r in read_jsonl(in_path) if (c := clean_record(r)) is not None)
    return write_jsonl(out_path, cleaned)


def main() -> None:
    ap = argparse.ArgumentParser(description="去噪规范化")
    ap.add_argument("--in", dest="in_path", default="./data/collected.jsonl")
    ap.add_argument("--out", default="./data/cleaned.jsonl")
    args = ap.parse_args()
    n = clean(args.in_path, args.out)
    print(f"cleaned {n} records -> {args.out}")


if __name__ == "__main__":
    main()
