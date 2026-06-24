#!/usr/bin/env bash
# 把 data/seed 下的合规种子语料入库到 rag_chunks。
# 这是入口/编排:真正的 切块→license 核验→bge-m3 向量化→入库 在 server/data_pipeline,
# 由 data-pipeline 单元实现(licenses.py 已是 license 白名单的唯一事实来源)。
# 脚本只负责:校验前置(库已建表、seed 非空)、定位 python、转交管线。
#
# 用法:
#   bash scripts/seed_knowledge.sh
#   PGURL=postgresql://... bash scripts/seed_knowledge.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_DIR="$ROOT_DIR/data/seed"
PGURL="${PGURL:-${EC_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/emotion}}"

# 库需可达(pgvector 扩展须已装);ingest 自己 ensure_schema 建 rag_chunks,
# 这里不预设表已存在,只确认连得上,连不上就把人导向 setup.sh。
if command -v psql >/dev/null 2>&1; then
    if ! psql "$PGURL" -c 'SELECT 1' >/dev/null 2>&1; then
        echo "连不上 postgres($PGURL)。先跑:bash scripts/setup.sh" >&2
        exit 1
    fi
fi

# ingest 读 JSONL Record(data_pipeline.schema.read_jsonl),只认 *.jsonl;
# .md 等其它格式不是管线的输入契约,这里只挑 jsonl。
SEED_FILES=()
while IFS= read -r f; do
    SEED_FILES+=("$f")
done < <(find "$SEED_DIR" -type f -name '*.jsonl' 2>/dev/null)

if [ "${#SEED_FILES[@]}" -eq 0 ]; then
    echo "data/seed 无 *.jsonl 种子语料。放入商用许可的 JSONL(来源须在 data_pipeline.licenses 白名单)后重试。" >&2
    exit 1
fi

PYTHON="${PYTHON:-python}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
    echo "找不到 python。先 pip install -e server,或设 PYTHON 指向解释器。" >&2
    exit 1
fi

echo "==> 入库 data/seed/*.jsonl → rag_chunks(经 license 核验 + bge-m3 向量化)"
# ingest 一次吃一个文件(--in),逐个转交;server 为包根,
# EC_DATABASE_URL 让管线连到同一库;入库逻辑归属 data_pipeline 单元。
for f in "${SEED_FILES[@]}"; do
    echo "  - $f"
    EC_DATABASE_URL="$PGURL" PYTHONPATH="$ROOT_DIR/server" \
        "$PYTHON" -m data_pipeline.ingest --in "$f" "$@"
done
