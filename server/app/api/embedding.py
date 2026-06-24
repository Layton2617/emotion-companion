from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.embedding import get_embedding_service

router = APIRouter(tags=["embedding"])


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)
    # 默认 32:bge-m3 单文本可达 8192 token,batch 太大在 CPU 上易 OOM。
    batch_size: int = Field(32, ge=1, le=256)


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    dim: int


@router.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest) -> EmbedResponse:
    settings = get_settings()
    embeddings = get_embedding_service().embed(req.texts, batch_size=req.batch_size)
    return EmbedResponse(
        embeddings=embeddings,
        model=settings.embedding_model,
        dim=settings.embedding_dim,
    )
