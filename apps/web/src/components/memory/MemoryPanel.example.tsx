"use client";

// 离线示例 / 手测夹具:无需后端即可渲染整个记忆面板。
// 也充当"接口怎么接"的活文档:onForget 走 memory.forget,onExport 是付费占位。
import { useState } from "react";
import type { MemoryItem, UserProfile } from "@emotion/core";
import { MemoryPanel } from "./MemoryPanel";

const DEMO_PROFILE: UserProfile = {
  userId: "demo",
  summary:
    "这阵子工作压力大，常常加班到很晚。提到家人时语气会软下来，养的猫叫汤圆。",
  currentEmotion: "孤独",
  openThreads: ["下周一的项目汇报", "和妈妈那次没说完的话"],
};

const DEMO_MEMORIES: MemoryItem[] = [
  {
    id: "1",
    userId: "demo",
    kind: "fact",
    text: "养了一只叫汤圆的橘猫，三岁。",
    createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  },
  {
    id: "2",
    userId: "demo",
    kind: "event",
    text: "上周项目上线那天加班到凌晨两点。",
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  },
  {
    id: "3",
    userId: "demo",
    kind: "emotion",
    text: "提到回家过年时，说有点近乡情怯。",
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id: "4",
    userId: "demo",
    kind: "open_thread",
    text: "想换工作但还没下定决心，怕辜负现在的团队。",
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
];

export function MemoryPanelExample() {
  const [memories, setMemories] = useState(DEMO_MEMORIES);

  return (
    <div className="h-screen w-[380px] border-l border-neutral-200">
      <MemoryPanel
        profile={DEMO_PROFILE}
        memories={memories}
        onForget={async (item) => {
          // 模拟 memory.forget(userId, id) 的网络往返
          await new Promise((r) => setTimeout(r, 400));
          setMemories((prev) => prev.filter((m) => m.id !== item.id));
        }}
        // onExport 故意留空,演示"即将开放"的付费占位态
      />
    </div>
  );
}
