"""Qwen2.5-7B 共情对齐 LoRA 后训练。

为什么 LoRA 而非全参:架构定调是"不做 pre-train,专业化=后训练对齐"。7B 全参微调
成本/漂移风险都高,LoRA 足以注入共情风格且可热插拔回滚。

为什么 4bit:让 7B 在单张消费级卡(24G)上也能跑通,降低复现门槛。

这里只搭好可自洽的训练配置与流程。重依赖(torch/transformers/peft/trl)延迟导入,
缺包/无 GPU 时不阻塞 import,便于在 CI 里 dry-run 校验配置。
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TrainConfig:
    base_model: str = "Qwen/Qwen2.5-7B-Instruct"
    train_file: str = "data/sft.jsonl"
    output_dir: str = "out/qwen2.5-7b-empathy-lora"

    # LoRA:rank/alpha 取 trl 常见共情 SFT 配置;只挂注意力+MLP 投影层
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    lora_target_modules: list[str] = field(
        default_factory=lambda: [
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ]
    )

    # QLoRA:4bit 量化基座,省显存
    load_in_4bit: bool = True

    # 训练超参:数据量小,epoch 偏多但配合 early-ish lr 防过拟合
    num_train_epochs: float = 3.0
    per_device_train_batch_size: int = 2
    gradient_accumulation_steps: int = 8
    learning_rate: float = 2e-4
    max_seq_length: int = 2048
    warmup_ratio: float = 0.03
    logging_steps: int = 10
    save_steps: int = 200
    bf16: bool = True
    seed: int = 42


def build_quant_config(cfg: TrainConfig):
    if not cfg.load_in_4bit:
        return None
    import torch
    from transformers import BitsAndBytesConfig

    return BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )


def build_peft_config(cfg: TrainConfig):
    from peft import LoraConfig

    return LoraConfig(
        r=cfg.lora_r,
        lora_alpha=cfg.lora_alpha,
        lora_dropout=cfg.lora_dropout,
        target_modules=cfg.lora_target_modules,
        bias="none",
        task_type="CAUSAL_LM",
    )


def load_dataset(train_file: str):
    """读 SFT jsonl({"messages":[...]})为 HF Dataset。"""
    from datasets import load_dataset as hf_load

    return hf_load("json", data_files=train_file, split="train")


def train(cfg: TrainConfig | None = None) -> str:
    """真训练入口。需要 GPU + 全套依赖。返回权重输出目录。"""
    cfg = cfg or TrainConfig()

    from transformers import AutoModelForCausalLM, AutoTokenizer
    from trl import SFTConfig, SFTTrainer

    tokenizer = AutoTokenizer.from_pretrained(cfg.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        cfg.base_model,
        quantization_config=build_quant_config(cfg),
        device_map="auto",
        trust_remote_code=True,
    )

    dataset = load_dataset(cfg.train_file)

    sft_config = SFTConfig(
        output_dir=cfg.output_dir,
        num_train_epochs=cfg.num_train_epochs,
        per_device_train_batch_size=cfg.per_device_train_batch_size,
        gradient_accumulation_steps=cfg.gradient_accumulation_steps,
        learning_rate=cfg.learning_rate,
        max_seq_length=cfg.max_seq_length,
        warmup_ratio=cfg.warmup_ratio,
        logging_steps=cfg.logging_steps,
        save_steps=cfg.save_steps,
        bf16=cfg.bf16,
        seed=cfg.seed,
        # trl 据 messages 字段自动套 Qwen chat template,无需手工拼字符串
        packing=False,
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=dataset,
        peft_config=build_peft_config(cfg),
        processing_class=tokenizer,
    )
    trainer.train()
    trainer.save_model(cfg.output_dir)
    tokenizer.save_pretrained(cfg.output_dir)
    return cfg.output_dir


def main() -> None:
    import argparse

    p = argparse.ArgumentParser(description="Qwen2.5-7B 共情 LoRA 后训练")
    p.add_argument("--train-file", default=TrainConfig.train_file)
    p.add_argument("--output-dir", default=TrainConfig.output_dir)
    p.add_argument("--base-model", default=TrainConfig.base_model)
    p.add_argument("--epochs", type=float, default=TrainConfig.num_train_epochs)
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="只构建并打印配置,不加载模型/不训练(无 GPU 校验用)",
    )
    args = p.parse_args()

    cfg = TrainConfig(
        base_model=args.base_model,
        train_file=args.train_file,
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
    )

    if args.dry_run:
        from dataclasses import asdict

        import json

        print(json.dumps(asdict(cfg), ensure_ascii=False, indent=2))
        print("[dry-run] 配置自洽,未加载模型")
        return

    out = train(cfg)
    print(f"LoRA adapter saved -> {out}")


if __name__ == "__main__":
    main()
