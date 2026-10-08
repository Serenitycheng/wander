import type { Metadata } from "next";
import { FavoritesPage } from "@/features/exploration/components/favorites-page";

export const metadata: Metadata = { title: "收藏" };
export default function Page() {
  return <FavoritesPage />;
}
