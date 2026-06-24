#!/usr/bin/env bash
# 一键初始化数据层:确认 postgres 可达 → 装 pgvector 扩展 → 建表 → 提示装依赖。
# 与 docker-compose.yml 对齐:服务名 postgres,库 emotion,账号 postgres/postgres,端口 5432。
#
# 幂等:扩展和表都是 IF NOT EXISTS,重复跑安全。
# 用法:
#   bash scripts/setup.sh            # 用默认 DSN(对齐 compose)
#   PGURL=postgresql://... bash scripts/setup.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# DSN 优先级:显式 PGURL > server 侧的 EC_DATABASE_URL > compose 默认。
# 三者保持同一事实来源,避免脚本和服务连到不同库。
PGURL="${PGURL:-${EC_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/emotion}}"

if ! command -v psql >/dev/null 2>&1; then
    echo "需要 psql 客户端。安装:brew install libpq && brew link --force libpq" >&2
    exit 1
fi

echo "==> 等待 postgres 就绪 ($PGURL)"
# pgvector/pgvector:pg16 容器起来到接受连接有几秒延迟,轮询而非假定立即可用。
for i in $(seq 1 30); do
    if psql "$PGURL" -c 'SELECT 1' >/dev/null 2>&1; then
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "postgres 连接超时。先 docker compose up -d postgres 再重试。" >&2
        exit 1
    fi
    sleep 1
done

echo "==> 应用 schema(pgvector 扩展 + memories + rag_chunks)"
psql "$PGURL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/scripts/init_db.sql"

echo "==> 数据层就绪。后续依赖请自行安装:"
echo "    pnpm install                 # TS workspace"
echo "    pip install -e server        # FastAPI 服务(embedding/reranker/危机分类器)"
echo "    bash scripts/seed_knowledge.sh   # 把 data/seed 合规种子语料入库"
