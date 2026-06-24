from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.crisis import LABELS, get_crisis_classifier

router = APIRouter(tags=["safety"])

# crisis 时幂等强制插入的求助信息。文案在此固定,保证 server 侧判级与干预一致;
# packages/safety 收到 crisis 后直接用这段,不再各自拼装(避免漏插热线)。
INTERVENTION_MESSAGE = (
    "我很担心你现在的状态。你的感受很重要,你不是一个人在面对。\n"
    "如果你有伤害自己的念头,请立刻联系专业的人:\n"
    "· 全国心理援助热线:12356(24 小时)\n"
    "· 北京心理危机研究与干预中心:010-82951332\n"
    "· 希望24热线:400-161-9995\n"
    "如果有立即的危险,请拨打 120 或前往最近的急诊。我会在这里陪着你。"
)


class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1)


class ClassifyResponse(BaseModel):
    # 对齐 packages/core types.ts 的 SafetyVerdict
    level: str
    reasons: list[str]
    interventionMessage: str | None = None
    needsHumanHandoff: bool = False
    # 分级概率(安全审计 / 阈值调参用),非 SafetyVerdict 字段但调用方可忽略。
    probabilities: dict[str, float]
    backend: str


@router.post("/safety/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest) -> ClassifyResponse:
    result = get_crisis_classifier().classify(req.text)

    is_crisis = result.level == "crisis"
    return ClassifyResponse(
        level=result.level,
        reasons=result.reasons,
        interventionMessage=INTERVENTION_MESSAGE if is_crisis else None,
        needsHumanHandoff=is_crisis,
        probabilities=result.probabilities,
        backend=result.backend,
    )


class SafetyConfigResponse(BaseModel):
    labels: list[str]
    crisis_threshold: float
    concern_threshold: float
    backend: str


@router.get("/safety/config", response_model=SafetyConfigResponse)
async def config() -> SafetyConfigResponse:
    # 暴露当前阈值与后端,便于运维确认线上是分类器还是规则回退。
    settings = get_settings()
    return SafetyConfigResponse(
        labels=list(LABELS),
        crisis_threshold=settings.crisis_threshold,
        concern_threshold=settings.concern_threshold,
        backend=get_crisis_classifier().backend,
    )
