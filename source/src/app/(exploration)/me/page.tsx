import type { Metadata } from "next";
import { MePage } from "@/features/exploration/components/me-page";

export const metadata: Metadata = { title: "我的" };
export default function Page() {
  return <MePage />;
}
