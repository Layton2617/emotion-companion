from __future__ import annotations

import threading

from app.core.config import get_settings

# 这里不在模块顶层 import torch / FlagEmbedding:它们加载慢且依赖重,
# 进程启动阶段(含只调 /health 的探活)不该被拖垮。全部延迟到首次推理。


def _resolve_device(configured: str) -> str:
    # 配置里写死 cpu 是为了在无 GPU 的开发机上不崩;但生产镜像里常给 "auto",
    # 此时按可用硬件自适应。mps 是 Apple Silicon,用于本地调试。
    if configured != "auto":
        return configured
    try:
        import torch
    except ImportError:
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class EmbeddingService:
    """bge-m3 编码 + bge-reranker-v2-m3 重排的单例封装。

    两个模型各自懒加载:很多请求只用到 embed,不该为此付出 reranker 的显存/内存。
    """

    _instance: "EmbeddingService | None" = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        settings = get_settings()
        self._device = _resolve_device(settings.device)
        self._embedding_model_name = settings.embedding_model
        self._reranker_model_name = settings.reranker_model
        # fp16 在 CPU 上无收益且 FlagEmbedding 会回退,仅 GPU 开。
        self._use_fp16 = self._device == "cuda"

        self._embedder = None
        self._reranker = None
        # 锁住的是加载过程而非推理:推理本身线程安全,但并发首请求会重复加载模型。
        self._embedder_lock = threading.Lock()
        self._reranker_lock = threading.Lock()

    @classmethod
    def instance(cls) -> "EmbeddingService":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def device(self) -> str:
        return self._device

    def _get_embedder(self):
        if self._embedder is None:
            with self._embedder_lock:
                if self._embedder is None:
                    from FlagEmbedding import BGEM3FlagModel

                    self._embedder = BGEM3FlagModel(
                        self._embedding_model_name,
                        use_fp16=self._use_fp16,
                        devices=self._device,
                    )
        return self._embedder

    def _get_reranker(self):
        if self._reranker is None:
            with self._reranker_lock:
                if self._reranker is None:
                    from FlagEmbedding import FlagReranker

                    self._reranker = FlagReranker(
                        self._reranker_model_name,
                        use_fp16=self._use_fp16,
                        devices=self._device,
                    )
        return self._reranker

    def embed(self, texts: list[str], batch_size: int = 32, max_length: int = 8192) -> list[list[float]]:
        # 只取 dense_vecs:memory/rag 侧用的是 pgvector 稠密检索,
        # sparse/colbert 暂未接入,算了也是浪费。
        out = self._get_embedder().encode(
            texts, batch_size=batch_size, max_length=max_length
        )["dense_vecs"]
        return out.tolist()

    def rerank(self, query: str, documents: list[str], normalize: bool = True) -> list[float]:
        pairs = [[query, doc] for doc in documents]
        scores = self._get_reranker().compute_score(pairs, normalize=normalize)
        # 单 pair 时 FlagEmbedding 返回标量,统一成 list。
        if isinstance(scores, (int, float)):
            return [float(scores)]
        return [float(s) for s in scores]


def get_embedding_service() -> EmbeddingService:
    return EmbeddingService.instance()
