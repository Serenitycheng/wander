import type {
  ExplorationAppearance,
  ExplorationPage,
  ExplorationSpace,
} from "./types.ts";

export const defaultTone = "#718c7c";
export const colorPresets = [
  { name: "竹绿", color: defaultTone },
  { name: "暖棕", color: "#80674d" },
  { name: "雾蓝", color: "#657f91" },
  { name: "藤紫", color: "#80769a" },
  { name: "亚麻", color: "#8b7658" },
  { name: "玫瑰", color: "#8a6f7d" },
  { name: "青灰", color: "#738287" },
] as const;
export const pageNames: Record<ExplorationPage, string> = {
  home: "首页",
  explore: "探索",
  favorites: "收藏",
  records: "记录",
  me: "我的",
};
export const isTone = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function spaceTone(
  preferences: ExplorationSpace["preferences"],
) {
  // Old per-page colors remain readable in v1 backups. Use one stable fallback
  // for the whole space until the user chooses a new shared color.
  return (
    preferences.tone ??
    Object.values(preferences.pageColors ?? {})[0] ??
    (preferences.theme === "lavender" ? "#80769a" : defaultTone)
  );
}

export function withSpaceTone(
  preferences: ExplorationSpace["preferences"],
  color: string,
) {
  if (!isTone(color)) return preferences;
  const next = { ...preferences, tone: color.toLowerCase() };
  delete next.pageColors;
  return next;
}

export function resetSpaceTone(preferences: ExplorationSpace["preferences"]) {
  const next = { ...preferences, theme: "sage" as const };
  delete next.tone;
  delete next.pageColors;
  return next;
}

export const maxColorSchemes = 12;

export function saveColorScheme(
  preferences: ExplorationSpace["preferences"],
  name: string,
  id: string,
) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 24 || !id || id.length > 64) return null;
  const schemes = preferences.colorSchemes ?? [];
  const existing = schemes.find((scheme) => scheme.name.toLowerCase() === trimmed.toLowerCase());
  if (!existing && schemes.length >= maxColorSchemes) return null;
  const saved = { id: existing?.id ?? id, name: trimmed, tone: spaceTone(preferences) };
  return {
    ...preferences,
    colorSchemes: existing ? schemes.map((scheme) => scheme.id === existing.id ? saved : scheme) : [...schemes, saved],
  };
}

export function parseAppearance(
  preferences: Record<string, unknown>,
): ExplorationAppearance | null {
  if (preferences.tone !== undefined && !isTone(preferences.tone)) return null;
  const colors = preferences.pageColors;
  if (
    colors !== undefined &&
    (!colors || typeof colors !== "object" || Array.isArray(colors))
  )
    return null;
  const entries = colors === undefined ? [] : Object.entries(colors);
  if (
    entries.some(
      ([page, color]) => !Object.hasOwn(pageNames, page) || !isTone(color),
    )
  )
    return null;
  const schemes = preferences.colorSchemes;
  if (schemes !== undefined && (!Array.isArray(schemes) || schemes.length > maxColorSchemes ||
    schemes.some((scheme) => !scheme || typeof scheme !== "object" || Array.isArray(scheme) ||
      typeof scheme.id !== "string" || !scheme.id.trim() || scheme.id.length > 64 ||
      typeof scheme.name !== "string" || !scheme.name.trim() || scheme.name.trim().length > 24 || !isTone(scheme.tone)) ||
    new Set(schemes.map((scheme) => scheme.id)).size !== schemes.length ||
    new Set(schemes.map((scheme) => scheme.name.trim().toLowerCase())).size !== schemes.length)) return null;
  return {
    ...(typeof preferences.tone === "string"
      ? { tone: preferences.tone.toLowerCase() }
      : {}),
    ...(colors !== undefined
      ? {
          pageColors: Object.fromEntries(
            entries.map(([page, color]) => [
              page,
              (color as string).toLowerCase(),
            ]),
          ),
        }
      : {}),
    ...(schemes !== undefined ? { colorSchemes: schemes.map((scheme) => ({
      id: scheme.id, name: scheme.name.trim(), tone: scheme.tone.toLowerCase(),
    })) } : {}),
  };
}

// The chosen hue remains visible in the paper tint. The ink is darkened only
// as needed to keep white button labels readable for arbitrary custom colors.
export function readableTone(color: string) {
  const safe = isTone(color) ? color : defaultTone;
  let rgb = [1, 3, 5].map((start) =>
    parseInt(safe.slice(start, start + 2), 16),
  );
  const luminance = () =>
    rgb
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  while (luminance() > 0.16) rgb = rgb.map((value) => Math.floor(value * 0.9));
  return "#" + rgb.map((value) => value.toString(16).padStart(2, "0")).join("");
}
