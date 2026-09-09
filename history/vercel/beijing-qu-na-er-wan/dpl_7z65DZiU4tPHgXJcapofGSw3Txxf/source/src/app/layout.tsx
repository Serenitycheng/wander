import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "北京去哪儿玩",
    template: "%s · 北京去哪儿玩",
  },
  description: "为你和朋友综合兴趣、距离、天气与实时活动，找到这次周末真正适合去的地方。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#738a78",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
