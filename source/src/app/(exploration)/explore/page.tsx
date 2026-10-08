import type { Metadata } from "next";
import { ExplorePage } from "@/features/exploration/components/explore-page";
import { isMode } from "@/features/exploration/types";

export const metadata: Metadata = { title: "探索" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; start?: string }>;
}) {
  const query = await searchParams;
  return (
    <ExplorePage
      key={query.mode ?? "default"}
      initialMode={isMode(query.mode) ? query.mode : undefined}
      autoStart={isMode(query.mode) || query.start === "1"}
    />
  );
}
