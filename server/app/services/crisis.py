from __future__ import annotations

import logging
import os
import re
import threading
from dataclasses import dataclass

from app.core.config import get_settings

# 安全关键路径独立 logger:分类结果必须可审计回溯(误判事后复盘、召回率统计)。
# 不打印原文全文,避免敏感个人信息落盘违反 PIPL;只记长度 + 截断片段 + 概率。
logger = logging.getLogger("ec.safety.crisis")

# 三档标签固定顺序,必须与微调时的 id2label 对齐;改顺序等于改语义,故写死在代码里。
LABELS = ("ok", "concern", "crisis")

# 顶层不 import torch / transformers:它们加载慢且依赖重,/health 探活不该被拖垮。

# 硬触发词表是分类器的下界兜底:模型漏判但命中明确自杀/自伤表述时,
# 直接强制升到 crisis。规则永远不会把 crisis 降级,只会向上覆盖。
_CRISIS_PATTERNS = [
    r"自杀",
    r"想死",
    r"不想活",
    r"活不下去",
    r"结束(自己的)?生命",
    r"了结(自己|此生)",
    r"轻生",
    r"割腕",
    r"割脉",
    r"跳楼",
    r"跳下去",
    r"跳下来",
    r"跳河",
    r"跳江",
    r"上吊",
    r"(准备|买)了?好?绳子",  # 备好工具:有计划但未直接说"死"
    r"烧炭",
    r"煤气自",
    r"安眠药.*(吃光|全吃|攒)",
    r"离开这个世界",
    r"没有(我|你).{0,4}(会)?更好",  # "没有我他们会更好过":中间可插入第三方
    # 间接 / 被动求死表述(实测最易漏):写遗书、找死法、自视累赘、无人在乎死活。
    r"遗书",
    r"(是|的|个).{0,3}累赘",
    r"在乎.{0,3}死活",
    r"(什么|哪种)(方式|方法|办法).{0,4}死",
    r"死.{0,2}不疼",
]
_CONCERN_PATTERNS = [
    r"绝望",
    r"撑不住",
    r"崩溃",
    r"没意义",
    r"没人(在乎|关心)",
    r"伤害自己",
    r"自残",
    r"很痛苦",
]

_CRISIS_RE = re.compile("|".join(_CRISIS_PATTERNS))
_CONCERN_RE = re.compile("|".join(_CONCERN_PATTERNS))


@dataclass
class CrisisResult:
    level: str  # LABELS 之一
    # 三档概率,和为 1;规则回退时为 one-hot 近似(规则没有真实置信度)。
    probabilities: dict[str, float]
    # "classifier" | "rule" — 调用方据此决定是否提示降级运行。
    backend: str
    # 命中的硬触发词标签,供 SafetyVerdict.reasons 透传。
    reasons: list[str]


def _safe_excerpt(text: str, limit: int = 40) -> str:
    # 日志只留短片段:既能定位问题,又把敏感原文外泄面降到最低。
    snippet = text.replace("\n", " ").strip()
    return snippet[:limit] + ("…" if len(snippet) > limit else "")


def _rule_reasons(text: str) -> tuple[str | None, list[str]]:
    reasons: list[str] = []
    level: str | None = None
    if _CRISIS_RE.search(text):
        reasons.append("self_harm_keyword")
        level = "crisis"
    elif _CONCERN_RE.search(text):
        reasons.append("distress_keyword")
        level = "concern"
    return level, reasons


class CrisisClassifier:
    """Chinese MentalBERT 微调危机分类器的单例封装。

    权重缺失(开发机 / 未训练完成)时回退到关键词规则,保证安全路径永远可用——
    宁可粗糙也不能因为模型没就位而对危机静默放行。
    """

    _instance: "CrisisClassifier | None" = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        settings = get_settings()
        self._weights_path = settings.crisis_classifier_path
        self._device = settings.device
        self._crisis_threshold = settings.crisis_threshold
        self._concern_threshold = settings.concern_threshold

        self._tokenizer = None
        self._model = None
        # 一次性判定:权重目录不存在就不必每次请求都试加载。
        self._weights_available = self._has_weights()
        self._load_lock = threading.Lock()

        logger.info(
            "crisis classifier init backend=%s weights_path=%s device=%s "
            "crisis_threshold=%.2f concern_threshold=%.2f",
            "classifier" if self._weights_available else "rule",
            self._weights_path,
            self._device,
            self._crisis_threshold,
            self._concern_threshold,
        )

    @classmethod
    def instance(cls) -> "CrisisClassifier":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _has_weights(self) -> bool:
        # HF from_pretrained 认 config.json 为有效模型目录的标志。
        return os.path.isfile(os.path.join(self._weights_path, "config.json"))

    @property
    def backend(self) -> str:
        return "classifier" if self._weights_available else "rule"

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._load_lock:
            if self._model is not None:
                return
            import torch
            from transformers import (
                AutoModelForSequenceClassification,
                AutoTokenizer,
            )

            self._tokenizer = AutoTokenizer.from_pretrained(self._weights_path)
            model = AutoModelForSequenceClassification.from_pretrained(
                self._weights_path
            )
            model.to(self._device)
            model.eval()
            self._model = model
            self._torch = torch

    def _classify_model(self, text: str) -> dict[str, float]:
        self._ensure_loaded()
        torch = self._torch
        inputs = self._tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=256,
        ).to(self._device)
        with torch.no_grad():
            logits = self._model(**inputs).logits[0]
            probs = torch.softmax(logits, dim=-1).tolist()
        # 微调时按 LABELS 顺序设 id2label,这里按位对齐。
        return {label: float(p) for label, p in zip(LABELS, probs)}

    def _level_from_probs(self, probs: dict[str, float]) -> str:
        # 阈值判级而非简单 argmax:危机召回率优先,允许 crisis 概率不是最高也升级。
        if probs["crisis"] >= self._crisis_threshold:
            return "crisis"
        if probs["concern"] >= self._concern_threshold:
            return "concern"
        return "ok"

    def classify(self, text: str) -> CrisisResult:
        rule_level, rule_reasons = _rule_reasons(text)

        if self._weights_available:
            try:
                probs = self._classify_model(text)
                level = self._level_from_probs(probs)
                backend = "classifier"
                reasons = [f"classifier_{level}"] if level != "ok" else []
            except Exception:
                # 模型推理炸了不能让安全路径整体失败:降级到规则。
                logger.exception("crisis classifier inference failed, falling back to rule")
                probs, level, backend, reasons = self._rule_result(rule_level, rule_reasons)
        else:
            probs, level, backend, reasons = self._rule_result(rule_level, rule_reasons)

        # 硬触发词永远向上覆盖,只升不降:模型说 ok 但命中自杀词仍判 crisis,
        # 命中痛苦词至少升到 concern。绝不因模型判低而把规则命中降回去。
        _rank = {"ok": 0, "concern": 1, "crisis": 2}
        if rule_level is not None and _rank[rule_level] > _rank[level]:
            level = rule_level
            probs = {"ok": 0.0, "concern": 0.0, "crisis": 0.0}
            probs[level] = 1.0
        if rule_reasons:
            reasons = list(dict.fromkeys(reasons + rule_reasons))

        logger.info(
            "classify backend=%s level=%s p_crisis=%.3f p_concern=%.3f reasons=%s len=%d text=%r",
            backend,
            level,
            probs["crisis"],
            probs["concern"],
            reasons,
            len(text),
            _safe_excerpt(text),
        )
        return CrisisResult(level=level, probabilities=probs, backend=backend, reasons=reasons)

    @staticmethod
    def _rule_result(
        rule_level: str | None, rule_reasons: list[str]
    ) -> tuple[dict[str, float], str, str, list[str]]:
        level = rule_level or "ok"
        probs = {"ok": 0.0, "concern": 0.0, "crisis": 0.0}
        probs[level] = 1.0
        return probs, level, "rule", list(rule_reasons)


def get_crisis_classifier() -> CrisisClassifier:
    return CrisisClassifier.instance()
