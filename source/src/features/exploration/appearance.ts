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

export function appearancePage(pathname: string): ExplorationPage {
  if (pathname.startsWith("/explore")) return "explore";
  if (pathname.startsWith("/favorites")) return "favorites";
  if (pathname.startsWith("/records")) return "records";
  if (pathname.startsWith("/me")) return "me";
  return "home";
}

export function pageTone(
  preferences: ExplorationSpace["preferences"],
  page: ExplorationPage,
) {
  return (
    preferences.pageColors?.[page] ??
    preferences.tone ??
    (preferences.theme === "lavender" ? "#80769a" : defaultTone)
  );
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
