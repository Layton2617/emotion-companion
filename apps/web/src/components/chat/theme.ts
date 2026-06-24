/**
 * 温暖配色集中放这里,组件直接引用内联 style。
 * 不引 Tailwind/CSS-in-JS,避免给本单元强加构建依赖 —— 这是个能自洽编译的纯 React 单元。
 */
export const theme = {
  bg: "#FBF7F2", // 暖米白,降低长时间陪伴的屏幕压迫感
  surface: "#FFFFFF",
  userBubble: "#FFE0C7", // 柔橙
  userText: "#5A3A26",
  aiBubble: "#F1ECFB", // 柔紫
  aiText: "#3D3550",
  textMuted: "#9A8F86",
  accent: "#E8896B", // 暖珊瑚,主按钮
  accentDisabled: "#E7D8CF",
  // 危机卡片:醒目但不刺眼 —— 暖琥珀而非告警红,避免惊吓到正处于危机中的人
  crisisBg: "#FFF4E6",
  crisisBorder: "#F0B775",
  crisisText: "#7A4E16",
  crisisAccent: "#D9822B",
  toastBg: "#3D3550",
  toastText: "#FBF7F2",
  radius: 16,
} as const;
