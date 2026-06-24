"""采集阶段 —— 只从商用安全源拉取,并把 license 落盘随数据走。

合规红线:
- 仅允许 licenses.ALLOWED_SOURCES 内的源(SmileChat CC0 / EmoLLM MIT)。
  下载前先 assert_allowed,非白名单源连下载动作都不执行。
- 反不正当竞争法 2025-10-15:不做通用爬虫,只走源方公开发布的数据集仓库。
- license 元数据随每条 Record 落盘(source + spdx),后续阶段无需回查即可追溯。

注:实际下载逻辑留占位 —— 真实环境用 huggingface_hub / git-lfs 拉取,
此处不联网。把"下载"和"解析成统一 Record"两步分开,便于离线替换数据。
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from data_pipeline.licenses import ALLOWED_SOURCES, assert_allowed
from data_pipeline.schema import Record, Turn, write_jsonl


def _stable_id(source: str, raw: str) -> str:
    # 内容哈希做 id:重复采集天然去重,且与原始顺序解耦。
    h = hashlib.sha1(f"{source}:{raw}".encode("utf-8")).hexdigest()[:16]
    return f"{source.lower()}-{h}"


def download_source(source: str, dest_dir: str | Path) -> Path:
    """下载占位。真实实现示例(离线环境不执行):

        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=..., repo_type="dataset", local_dir=dest)

    SmileChat: https://github.com/qiuhuachuan/smile
    EmoLLM:    https://github.com/SmartFlowAI/EmoLLM
    """
    lic = assert_allowed(source)  # 下载前先核 license,挡在最前面
    dest = Path(dest_dir) / source
    dest.mkdir(parents=True, exist_ok=True)
    # 记录 license 到本地,审计时不依赖代码即可看到许可来源
    (dest / "LICENSE.meta").write_text(
        f"source={lic.name}\nspdx={lic.spdx}\ncommercial_ok={lic.commercial_ok}\n"
        f"url={lic.url}\nnote={lic.note}\n",
        encoding="utf-8",
    )
    return dest


def parse_source(source: str, raw_dir: str | Path) -> list[Record]:
    """把源的原始格式解析成统一 Record。

    各源原始 schema 不同(SmileChat 是 dialog 列表,EmoLLM 是 instruction/output),
    真实环境在这里分流解析。离线占位:产出两条样例,保证下游可跑通。
    """
    lic = assert_allowed(source)
    samples = _PLACEHOLDER_SAMPLES.get(source, [])
    out: list[Record] = []
    for turns, strategy in samples:
        raw = "".join(t["content"] for t in turns)
        out.append(
            Record(
                id=_stable_id(source, raw),
                source=source,
                license=lic.spdx,
                turns=[Turn(**t) for t in turns],
                strategy=strategy,
                stages=["collect"],
            )
        )
    return out


# 离线占位样本:仅供管线自测,非真实语料。
_PLACEHOLDER_SAMPLES: dict[str, list[tuple[list[dict], str | None]]] = {
    "SmileChat": [
        (
            [
                {"role": "user", "content": "最近一个人住,晚上总觉得空落落的。"},
                {"role": "assistant", "content": "一个人面对夜晚确实会放大孤独感,愿意多说说那种空落落的感觉吗?"},
            ],
            "reflection",
        ),
    ],
    "EmoLLM": [
        (
            [
                {"role": "user", "content": "我老是焦虑,做什么都静不下来。"},
                {"role": "assistant", "content": "听起来焦虑已经影响到日常了,我们可以先试一个简单的呼吸练习,慢慢把注意力拉回来。"},
            ],
            "coping_strategy",
        ),
    ],
}


def collect(sources: list[str], raw_dir: str | Path, out_path: str | Path) -> int:
    records: list[Record] = []
    for src in sources:
        download_source(src, raw_dir)
        records.extend(parse_source(src, raw_dir))
    return write_jsonl(out_path, records)


def main() -> None:
    ap = argparse.ArgumentParser(description="采集商用安全语料")
    ap.add_argument(
        "--sources", nargs="+", default=list(ALLOWED_SOURCES.keys()),
        help="白名单内的源名;默认全部",
    )
    ap.add_argument("--raw-dir", default="./data/raw")
    ap.add_argument("--out", default="./data/collected.jsonl")
    args = ap.parse_args()
    n = collect(args.sources, args.raw_dir, args.out)
    print(f"collected {n} records -> {args.out}")


if __name__ == "__main__":
    main()
