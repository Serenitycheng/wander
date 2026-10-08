import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./beijing.css";

export const metadata: Metadata = {
  title: "北京去哪儿玩",
  description: "漫游的北京出行子模块：多人偏好、具体地点与路线。",
};

export default function BeijingLayout({ children }: { children: ReactNode }) {
  return <div className="beijing-module">{children}</div>;
}
