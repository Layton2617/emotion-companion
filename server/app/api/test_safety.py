from __future__ import annotations

# 不依赖 torch/transformers/权重:强制走规则回退后端,验证三档判级、
# 硬触发词向上覆盖、crisis 时必须返回热线 + 人工接管标记。
# 分类器自身的概率正确性由微调与 eval 召回率项保证,不在单测范围。

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.crisis import CrisisClassifier


def _rule_client() -> TestClient:
    CrisisClassifier._instance = None
    svc = CrisisClassifier.instance()
    svc._weights_available = False  # 关掉分类器,纯规则
    return TestClient(create_app())


def test_crisis_keyword_forces_intervention():
    client = _rule_client()
    resp = client.post("/safety/classify", json={"text": "我不想活了,想自杀"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["level"] == "crisis"
    assert body["needsHumanHandoff"] is True
    assert "12356" in body["interventionMessage"]
    assert "self_harm_keyword" in body["reasons"]


def test_concern_keyword():
    client = _rule_client()
    resp = client.post("/safety/classify", json={"text": "最近好绝望,撑不住了"})
    body = resp.json()
    assert body["level"] == "concern"
    assert body["interventionMessage"] is None
    assert body["needsHumanHandoff"] is False


def test_neutral_text_ok():
    client = _rule_client()
    resp = client.post("/safety/classify", json={"text": "今天天气不错,想出去走走"})
    body = resp.json()
    assert body["level"] == "ok"
    assert body["reasons"] == []


def test_empty_rejected():
    client = _rule_client()
    resp = client.post("/safety/classify", json={"text": ""})
    assert resp.status_code == 422


def test_keyword_upgrades_over_model_ok():
    # 模型判 ok 但命中规则词时,规则只升不降:痛苦词→concern,自杀词→crisis。
    CrisisClassifier._instance = None
    svc = CrisisClassifier.instance()
    svc._weights_available = True
    svc._classify_model = lambda text: {"ok": 0.95, "concern": 0.03, "crisis": 0.02}
    client = TestClient(create_app())

    resp = client.post("/safety/classify", json={"text": "最近好绝望,撑不住了"})
    body = resp.json()
    assert body["level"] == "concern"
    assert "distress_keyword" in body["reasons"]

    resp = client.post("/safety/classify", json={"text": "我想自杀"})
    body = resp.json()
    assert body["level"] == "crisis"
    assert body["needsHumanHandoff"] is True

    CrisisClassifier._instance = None


def test_config_reports_rule_backend():
    client = _rule_client()
    resp = client.get("/safety/config")
    body = resp.json()
    assert body["backend"] == "rule"
    assert body["labels"] == ["ok", "concern", "crisis"]


if __name__ == "__main__":
    test_crisis_keyword_forces_intervention()
    test_concern_keyword()
    test_neutral_text_ok()
    test_empty_rejected()
    test_keyword_upgrades_over_model_ok()
    test_config_reports_rule_backend()
    print("ok")
