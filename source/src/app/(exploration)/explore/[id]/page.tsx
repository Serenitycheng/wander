import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allExplorationIdeas, findIdea } from "@/features/exploration/ideas";
import { IdeaDetail, DiscoveredIdeaDetail } from "@/features/exploration/components/detail-page";
import { isOnlineIdeaId } from "@/features/exploration/discovery";

export function generateStaticParams() {
  return allExplorationIdeas.map((idea) => ({ id: idea.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: findIdea(id)?.title ?? "探索入口" };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idea = findIdea(id);
  if (!idea && isOnlineIdeaId(id)) return <DiscoveredIdeaDetail id={id} />;
  if (!idea) notFound();
  return <IdeaDetail idea={idea} />;
}
