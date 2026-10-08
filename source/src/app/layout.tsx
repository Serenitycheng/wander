import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "漫游",
  title: {
    default: "漫游 · 去试一点新的",
    template: "%s · 漫游",
  },
  description:
    "出去走走、在家探索、学点东西、做点东西。给自己一个轻轻开始的入口，随时换个方向。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f5ef",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
