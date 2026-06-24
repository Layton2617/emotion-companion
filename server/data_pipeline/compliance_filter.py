"""合规过滤阶段 —— 双闸:license 白名单核验 + PII 脱敏。一票否决。

合规红线(架构文档 §数据合规红线):
- 敏感个人信息最小化:手机号/姓名/地址等在入库前必须脱敏,降低 PIPL 风险面。
- license 白名单核验:非白名单源 assert_allowed 直接抛错,拒绝进入后续阶段。
  这是整条管线最后一道、也是最硬的合规闸,绝不能 try/except 吞掉。
- 脱敏是有损的、不可逆的占位替换,而非加密 —— 训练/检索语料不需要还原原文。

脱敏策略:正则覆盖结构化 PII(手机号/身份证/邮箱/地址关键词)。
姓名识别:正则只能覆盖"称谓+姓"这类高置信模式,中文姓名通用识别需 NER,
此处不引入重依赖,留 hook(replace_names)给上游接 NER 时替换实现。
"""

from __future__ import annotations

import argparse
import re

from data_pipeline.licenses import assert_allowed
from data_pipeline.schema import Record, read_jsonl, write_jsonl

# 中国大陆手机号:1 开头第二位 3-9,共 11 位。前后用非数字边界避免切到长数字串中段。
_PHONE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
# 18 位身份证(末位可为 X);15 位旧号一并覆盖。
_ID_CARD = re.compile(r"(?<!\d)(\d{17}[\dXx]|\d{15})(?!\d)")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# 银行卡:16-19 位连续数字。会有少量误伤,但宁可多脱不可漏脱。
_BANK_CARD = re.compile(r"(?<!\d)\d{16,19}(?!\d)")
# 地址:省市区/详细门牌关键词触发,把含关键词的最小片段替换。中文地址无固定边界,
# 用"行政区划后缀 + 后续门牌字样"近似框定。
_ADDRESS = re.compile(
    r"[一-龥]{2,8}(省|市|区|县|镇|乡|村|街道|路|街|号楼|小区|大厦)"
    r"[一-龥\dA-Za-z\-]{0,20}(号|室|栋|单元|楼)?"
)
# 称谓 + 单字姓:高置信姓名模式。"我叫张三""王女士""李先生"。
_NAME_TITLE = re.compile(
    r"(我叫|我是|姓名[:：]?|名字叫)[\s]*([一-龥]{2,4})"
)
_NAME_HONORIFIC = re.compile(
    r"([一-龥])(先生|女士|小姐|同学|老师|医生)"
)

# 占位符统一前缀,便于下游审计统计脱敏命中量。
MASK = {
    "phone": "[PHONE]",
    "id_card": "[ID]",
    "email": "[EMAIL]",
    "bank_card": "[BANK]",
    "address": "[ADDRESS]",
    "name": "[NAME]",
}


def redact(text: str) -> tuple[str, list[str]]:
    """返回(脱敏后文本, 命中的 PII 类型标签)。

    顺序有讲究:先脱身份证/银行卡(长数字),再脱手机号,避免长号被手机号规则截断。
    """
    hits: list[str] = []

    def _sub(pat: re.Pattern, repl: str, tag: str, s: str) -> str:
        nonlocal hits
        new, n = pat.subn(repl, s)
        if n:
            hits.append(tag)
        return new

    text = _sub(_ID_CARD, MASK["id_card"], "id_card", text)
    text = _sub(_BANK_CARD, MASK["bank_card"], "bank_card", text)
    text = _sub(_PHONE, MASK["phone"], "phone", text)
    text = _sub(_EMAIL, MASK["email"], "email", text)
    text = _sub(_ADDRESS, MASK["address"], "address", text)
    text = _sub(_NAME_TITLE, lambda m: m.group(1) + MASK["name"], "name", text)
    text = _sub(_NAME_HONORIFIC, lambda m: MASK["name"] + m.group(2), "name", text)
    return text, hits


def replace_names(text: str) -> str:
    """姓名脱敏 hook。默认只做正则覆盖的高置信模式(已在 redact 内完成);
    接入中文 NER(如 hanlp/spaCy)时在此覆写以覆盖通用人名。"""
    return text


def filter_record(rec: Record) -> Record:
    # 闸 1:license。非白名单直接抛错,中断整条管线 —— 不允许带病数据入库。
    assert_allowed(rec.source)
    # 闸 2:逐 turn 脱敏。
    all_hits: list[str] = []
    for t in rec.turns:
        t.content, hits = redact(t.content)
        all_hits.extend(hits)
    rec.stages.append("compliance")
    if all_hits:
        # 记录命中类型(不记原值),审计时能回答"脱了什么",但不留 PII 痕迹。
        rec.stages.append("pii:" + ",".join(sorted(set(all_hits))))
    return rec


def run(in_path: str, out_path: str) -> int:
    # 这里不吞 PermissionError:任一条非白名单源都应让整批失败,逼人去查来源。
    filtered = (filter_record(r) for r in read_jsonl(in_path))
    return write_jsonl(out_path, filtered)


def main() -> None:
    ap = argparse.ArgumentParser(description="license 核验 + PII 脱敏")
    ap.add_argument("--in", dest="in_path", default="./data/cleaned.jsonl")
    ap.add_argument("--out", default="./data/compliant.jsonl")
    args = ap.parse_args()
    n = run(args.in_path, args.out)
    print(f"compliance-passed {n} records -> {args.out}")


if __name__ == "__main__":
    main()
