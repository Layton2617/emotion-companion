"""离线端到端示例:collect → clean → compliance → chunk(不含 embed/入库)。

用途:无网络无 GPU 也能跑通,验证各阶段契约自洽。ingest 需要 pgvector + bge-m3,
本脚本止于 chunk,打印结果即可。
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from data_pipeline import clean, collect, compliance_filter
from data_pipeline.chunk import chunk_file
from data_pipeline.licenses import ALLOWED_SOURCES


def main() -> None:
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        collected = d / "collected.jsonl"
        cleaned = d / "cleaned.jsonl"
        compliant = d / "compliant.jsonl"

        n0 = collect.collect(list(ALLOWED_SOURCES), d / "raw", collected)
        n1 = clean.clean(str(collected), str(cleaned))
        n2 = compliance_filter.run(str(cleaned), str(compliant))
        chunks = chunk_file(str(compliant))

        print(f"collect={n0} clean={n1} compliance={n2} chunks={len(chunks)}")
        for c in chunks:
            print("---", c.id, c.source, c.license, c.strategy)
            print(c.text)


if __name__ == "__main__":
    main()
