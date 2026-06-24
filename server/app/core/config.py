from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="EC_", extra="ignore"
    )

    app_name: str = "emotion-companion-server"
    env: str = "dev"

    # asyncpg DSN; pgvector 扩展需在该库内已 `CREATE EXTENSION vector`
    database_url: str = "postgresql://postgres:postgres@localhost:5432/emotion"
    db_pool_min: int = 1
    db_pool_max: int = 10

    # bge-m3 输出 1024 维;改模型必须同步迁移向量列维度,故固定在配置里
    embedding_model: str = "BAAI/bge-m3"
    embedding_dim: int = 1024
    reranker_model: str = "BAAI/bge-reranker-v2-m3"

    # Chinese MentalBERT 微调后的危机分类器权重目录
    crisis_classifier_path: str = "./weights/crisis-mentalbert"

    # 安全关键路径:分类器三档判级阈值。宁可误报(召回率优先,见 eval 一票否决项)。
    # crisis 概率 ≥ crisis_threshold → crisis;否则 concern 概率 ≥ concern_threshold → concern。
    crisis_threshold: float = 0.5
    concern_threshold: float = 0.4

    # CPU/cuda/mps;在无 GPU 机器上跑推理时显式降级
    device: str = "cpu"

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])


@lru_cache
def get_settings() -> Settings:
    return Settings()
