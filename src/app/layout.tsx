import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "宇宙无敌第一近代史刷题库",
  description: "宇宙无敌第一近代史刷题库 — 中国近代史 / 中国近现代史私有刷题系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
