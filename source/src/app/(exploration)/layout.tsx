import type { ReactNode } from "react";
import { ExplorationApp } from "@/features/exploration/components/exploration-app";

export default function ExplorationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ExplorationApp>{children}</ExplorationApp>;
}
