"""管线内部数据契约。各阶段读写 jsonl,字段统一在此定义,避免阶段间靠"约定"对齐。"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable, Iterator


@dataclass
class Turn:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class Record:
    """一条对话样本,贯穿 collect→clean→compliance→chunk→ingest。"""

    id: str
    source: str  # 必须命中 licenses.ALLOWED_SOURCES
    license: str  # SPDX,合规追溯用(对齐 core types.ts Chunk.license)
    turns: list[Turn] = field(default_factory=list)
    # 共情策略标签,EmoLLM/PsyQA 体系下的回复策略(对齐 Chunk.strategy)
    strategy: str | None = None
    # 经过哪些处理阶段,审计用
    stages: list[str] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    @staticmethod
    def from_dict(d: dict) -> "Record":
        turns = [Turn(**t) for t in d.get("turns", [])]
        return Record(
            id=d["id"],
            source=d["source"],
            license=d["license"],
            turns=turns,
            strategy=d.get("strategy"),
            stages=d.get("stages", []),
        )


def read_jsonl(path: str | Path) -> Iterator[Record]:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield Record.from_dict(json.loads(line))


def write_jsonl(path: str | Path, records: Iterable[Record]) -> int:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(p, "w", encoding="utf-8") as f:
        for r in records:
            f.write(r.to_json() + "\n")
            n += 1
    return n
