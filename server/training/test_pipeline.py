"""端到端 smoke test:种子 → 合成 → SFT 转换 → 训练 dry-run。

不真训练(无 GPU/无网),只验证数据流逻辑自洽、产物 schema 正确、合规守门生效。
直接 `python test_pipeline.py` 即可跑。
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from digital_twin import (
    DEMO_SEEDS,
    EchoBackend,
    SeedCase,
    generate,
    write_jsonl,
)
from prepare_dataset import SFT_SYSTEM_PROMPT, _read_jsonl, convert, to_sft_sample
from train_lora import TrainConfig, build_peft_config


def test_seed_rejects_noncommercial_license() -> None:
    try:
        SeedCase("x", "t", "p", license="CC-BY-NC-4.0")
    except ValueError:
        return
    raise AssertionError("非商用许可应被拒")


def test_generate_is_deterministic() -> None:
    # case_id 做随机种子 → 合成可复现可审计
    a = generate(DEMO_SEEDS, backend=EchoBackend())
    b = generate(DEMO_SEEDS, backend=EchoBackend())
    assert [t.content for d in a for t in d.turns] == [t.content for d in b for t in d.turns]


def test_dialogue_alternates_roles() -> None:
    dlg = generate([DEMO_SEEDS[0]], backend=EchoBackend(), n_turns=3)[0]
    roles = [t.role for t in dlg.turns]
    assert roles[0] == "client"
    assert "counselor" in roles
    # client/counselor 必须交替
    assert all(roles[i] != roles[i + 1] for i in range(len(roles) - 1))


def test_sft_conversion_shape() -> None:
    dlg = generate([DEMO_SEEDS[0]], backend=EchoBackend())[0]
    from dataclasses import asdict

    sample = to_sft_sample(asdict(dlg))
    assert sample is not None
    msgs = sample["messages"]
    assert msgs[0] == {"role": "system", "content": SFT_SYSTEM_PROMPT}
    assert {m["role"] for m in msgs[1:]} <= {"user", "assistant"}
    assert any(m["role"] == "assistant" for m in msgs)


def test_sft_drops_noncommercial() -> None:
    assert to_sft_sample({"license": "CC-BY-NC-4.0", "turns": []}) is None


def test_end_to_end_files() -> None:
    with tempfile.TemporaryDirectory() as d:
        raw = Path(d) / "raw.jsonl"
        sft = Path(d) / "sft.jsonl"
        write_jsonl(generate(DEMO_SEEDS, backend=EchoBackend()), raw)
        samples = convert(_read_jsonl(raw))
        sft.write_text(
            "\n".join(__import__("json").dumps(s, ensure_ascii=False) for s in samples),
            "utf-8",
        )
        assert len(samples) == len(DEMO_SEEDS)
        assert sft.read_text("utf-8").strip()


def test_peft_config_targets() -> None:
    cfg = build_peft_config(TrainConfig()) if _has_peft() else None
    if cfg is None:
        return  # peft 未装时跳过,不让缺包阻塞 smoke test
    assert "q_proj" in cfg.target_modules
    assert cfg.task_type == "CAUSAL_LM"


def _has_peft() -> bool:
    try:
        import peft  # noqa: F401

        return True
    except ImportError:
        return False


def _run_all() -> None:
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("\nall smoke tests passed")


if __name__ == "__main__":
    _run_all()
