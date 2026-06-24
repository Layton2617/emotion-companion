from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.embedding import get_embedding_service

router = APIRouter(tags=["rerank"])


class RerankRequest(BaseModel):
    query: str
    documents: list[str] = Field(..., min_length=1)
    # rag.retrieve 是 bge-m3 召回后再 rerank,通常只需要 top-k;不传则返回全部。
    top_k: int | None = Field(None, ge=1)


class RerankResult(BaseModel):
    index: int
    score: float
    document: str


class RerankResponse(BaseModel):
    results: list[RerankResult]
    model: str


@router.post("/rerank", response_model=RerankResponse)
async def rerank(req: RerankRequest) -> RerankResponse:
    settings = get_settings()
    scores = get_embedding_service().rerank(req.query, req.documents)

    ranked = sorted(
        (RerankResult(index=i, score=s, document=req.documents[i]) for i, s in enumerate(scores)),
        key=lambda r: r.score,
        reverse=True,
    )
    if req.top_k is not None:
        ranked = ranked[: req.top_k]

    return RerankResponse(results=ranked, model=settings.reranker_model)
