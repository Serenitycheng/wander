import { CityExperience } from "@/features/beijing/components/city-experience";

export default async function BeijingPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string }>;
}) {
  const { space } = await searchParams;
  return <CityExperience initialSpace={space === "zzz" ? "zzz" : "serenity"} />;
}
