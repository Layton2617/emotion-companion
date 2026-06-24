from __future__ import annotations

import importlib
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.db import connect, disconnect

# 各 router 由独立单元提供,且按需重型加载(transformers/torch)。
# 用模块路径注册,缺失或导入失败时跳过单个 router 而非拖垮整个进程启动。
_ROUTER_MODULES = [
    "app.api.embedding",
    "app.api.rerank",
    "app.api.safety",
    "app.api.memory",
]


def _load_routers(app: FastAPI) -> None:
    for path in _ROUTER_MODULES:
        try:
            mod = importlib.import_module(path)
        except ModuleNotFoundError:
            continue
        router = getattr(mod, "router", None)
        if isinstance(router, APIRouter):
            app.include_router(router)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    try:
        yield
    finally:
        await disconnect()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "env": settings.env}

    _load_routers(app)
    return app


app = create_app()
