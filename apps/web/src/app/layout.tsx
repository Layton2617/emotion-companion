import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "会记得你的情绪陪伴",
  description: "一个会记得你的 AI 陪伴。它由 AI 提供,不替代专业心理或医疗帮助。",
};

export const viewport: Viewport = {
  // 疗愈场景多在夜间手机端使用,锁定主题色为暖砂避免系统深色反转造成刺眼切换。
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
