import type { ExplorationMode } from "./types.ts";
import { readingReferences } from "./profile.ts";
import type { DiscoveryPersonalization } from "./profile.ts";

// These are search directions, not a fixed list of activities or titles.
const topics = {
  outside: ["北京 独立书店", "北京 公园 步道", "北京 美术馆 展览", "北京 攀岩 体验", "北京 植物园", "北京 陶艺 体验", "北京 科学馆", "北京 老建筑", "北京 现场音乐", "北京 骑行", "北京 博物馆", "北京 手工 工作坊"],
  home: ["短篇小说", "纪录片 自然", "唱歌 伴奏", "历史 纪录片", "桌游 入门", "烹饪 食谱", "诗词 原文", "电影 幕后", "天文 科普", "推理小说", "心理学", "现场音乐", "艺术史", "园艺", "哲学"],
  learn: ["天文 科普", "语言学", "摄影 入门", "建筑", "音乐理论", "编程 交互教程", "地质学", "电影语言", "自然观察", "经济学 入门", "世界历史", "数学 可视化", "设计 入门", "考古", "植物", "机械原理"],
  create: ["折纸 教程", "速写 入门", "烹饪 食谱", "装帧 手工", "编曲 入门", "书法 诗词", "编织 教程", "摄影 技巧", "陶艺 入门", "版画 手工", "像素画 教程", "木工 入门", "拼贴", "咖啡 冲煮", "刺绣 入门"],
};

export function discoveryTopics(mode: ExplorationMode, seed: number, profile?: DiscoveryPersonalization): string[] {
  const pool = mode === "random" ? Object.values(topics).flat() : topics[mode];
  const start = Math.abs(seed) % pool.length;
  const stride = Math.max(1, Math.floor(pool.length / 3));
  const directions = Array.from({ length: 3 }, (_, index) => pool[(start + index * stride) % pool.length]);
  const references = readingReferences(profile);
  if (references.length && ["home", "learn", "random"].includes(mode) && seed % 3 !== 2)
    directions[0] = `《${references[Math.floor(seed / 3) % references.length]}》 文学 人物 视频`;
  // Keep the other directions independent of the reading list.
  return directions;
}
