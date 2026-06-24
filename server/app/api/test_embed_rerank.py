from __future__ import annotations

# 不依赖 torch/FlagEmbedding/网络:把 EmbeddingService 的两个推理方法替成桩,
# 只验证路由、payload 契约、rerank 排序逻辑。重模型的正确性由模型自身保证。

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.embedding import EmbeddingService


def _make_client(monkeypatch_targets: dict) -> TestClient:
    EmbeddingService._instance = None
    svc = EmbeddingService.instance()
    for name, fn in monkeypatch_targets.items():
        setattr(svc, name, fn)
    return TestClient(create_app())


def test_embed_returns_vectors_with_dim():
    client = _make_client(
        {"embed": lambda texts, batch_size=32: [[0.1, 0.2, 0.3] for _ in texts]}
    )
    resp = client.post("/embed", json={"texts": ["你好", "在吗"]})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["embeddings"]) == 2
    assert body["model"] == "BAAI/bge-m3"
    assert body["dim"] == 1024


def test_embed_rejects_empty():
    client = _make_client({"embed": lambda texts, batch_size=32: []})
    resp = client.post("/embed", json={"texts": []})
    assert resp.status_code == 422


def test_rerank_sorts_desc_and_applies_top_k():
    client = _make_client(
        {"rerank": lambda query, documents: [0.2, 0.9, 0.5]}
    )
    resp = client.post(
        "/rerank",
        json={"query": "我很孤独", "documents": ["a", "b", "c"], "top_k": 2},
    )
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert [r["index"] for r in results] == [1, 2]
    assert results[0]["score"] == 0.9


if __name__ == "__main__":
    test_embed_returns_vectors_with_dim()
    test_embed_rejects_empty()
    test_rerank_sorts_desc_and_applies_top_k()
    print("ok")
