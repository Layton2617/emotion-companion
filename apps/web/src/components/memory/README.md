# 记忆面板 web-memory

核心卖点"长期记忆"的可视化。所有类型来自 `@emotion/core`(`MemoryItem` / `UserProfile`),不在此重定义。

## 组件

- `MemoryPanel` — 容器。分组展示 fact / event / emotion / open_thread,顶部 `ProfileSummary`,底部"导出回忆册"。
- `MemoryChip` — 单条记忆。`onForget` 对应 `memory.forget(userId, id)`,即 PIPL 的可删除。
- `ProfileSummary` — 温柔呈现情绪近况;只陪伴不诊断。

## 接口怎么接(给集成方)

```tsx
<MemoryPanel
  profile={await memory.profile(userId)}
  memories={await memory.recall(userId, query, k)}
  onForget={(item) => memory.forget(userId, item.id)} // PIPL
  onExport={isPaid ? exportMemoryBook : undefined}     // 不传 => "即将开放"占位
/>
```

离线预览见 `MemoryPanel.example.tsx`(`MemoryPanelExample`),无需后端。

## 设计取舍(对应调研原则)

- 留存:`open_thread` 置顶,作为"主动回忆"钩子。
- 克制:情绪文案不放大焦虑,不下诊断结论。
- 合规:删除入口常驻、不藏匿;导出付费但记忆本身可随时带走/删除。

样式用 Tailwind 原子类(随 apps/web 全局配置生效),组件本身零运行时依赖,仅依赖 React 与 `@emotion/core` 的类型。
