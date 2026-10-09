import { isObject } from "./discovery.ts";
import type { ExplorationProfile, ExplorationSpace, SpaceOwner } from "./types.ts";

export type DiscoveryPersonalization = {
  interests: string;
  readingList: string;
  favoriteTitles: string[];
};

// Summarized from the user's reading list, not a claim that these books were read.
// Other accounts start with an empty profile and never inherit Serenity's tastes.
export function defaultProfile(owner: SpaceOwner): ExplorationProfile {
  return {
    personalized: true,
    allowFeeds: false,
    interests: owner === "serenity" ? "故事与人物、文学审美、哲学、地域文化、社会观察。也愿意唱首歌、看看视频，尝试其他陌生领域。" : "",
    readingList: owner === "serenity" ? "《边城》《尘埃落定》《额尔古纳河右岸》《受戒》《春雪》《伊豆的舞女》《雪国》《伊甸之东》《风之影》《长日将尽》《悉达多》《地海传奇》《哲学的故事》《乡土中国》《忧郁的热带》" : "",
  };
}

export const profileFor = (space: ExplorationSpace): ExplorationProfile =>
  space.preferences.profile ?? defaultProfile(space.owner);

export function parseProfile(value: unknown): ExplorationProfile | null {
  if (!isObject(value) || typeof value.personalized !== "boolean" || typeof value.allowFeeds !== "boolean" ||
    typeof value.interests !== "string" || value.interests.length > 1000 ||
    typeof value.readingList !== "string" || value.readingList.length > 2400) return null;
  return { personalized: value.personalized, allowFeeds: value.allowFeeds, interests: value.interests.trim(), readingList: value.readingList.trim() };
}

export function parsePersonalization(value: unknown): DiscoveryPersonalization | null {
  if (!isObject(value) || typeof value.interests !== "string" || value.interests.length > 1000 ||
    typeof value.readingList !== "string" || value.readingList.length > 2400 ||
    !Array.isArray(value.favoriteTitles) || value.favoriteTitles.length > 12 ||
    !value.favoriteTitles.every((title) => typeof title === "string" && title.length <= 160)) return null;
  return { interests: value.interests.trim(), readingList: value.readingList.trim(), favoriteTitles: [...value.favoriteTitles] };
}

export function readingReferences(profile?: DiscoveryPersonalization): string[] {
  if (!profile) return [];
  const titles = [...profile.readingList.matchAll(/《([^》]{1,100})》/g)].map((match) => match[1]);
  return titles.length ? [...new Set(titles)] : profile.readingList.split(/[\n、，,；;]/).map((value) => value.trim()).filter(Boolean).slice(0, 30);
}
