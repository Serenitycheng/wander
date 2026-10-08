import type { Metadata } from "next";
import { RecordsPage } from "@/features/exploration/components/records-page";

export const metadata: Metadata = { title: "记录" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string }>;
}) {
  const { idea } = await searchParams;
  return <RecordsPage key={idea ?? "default"} initialIdeaId={idea} />;
}
