import type { ExplorationFilters, ExplorationIdea, SpaceOwner } from "./types.ts";

export const localOutingArea = "liangxiang-yangguangyishang" as const;
export type OutingArea = typeof localOutingArea;
export const outingAreaFor = (owner: SpaceOwner): OutingArea | undefined => owner === "serenity" ? localOutingArea : undefined;

export const shortLocalOuting = (filters: ExplorationFilters, area?: OutingArea) =>
  area === localOutingArea && filters.time === "short";

// A broad label such as "良乡" or "房山" is not evidence of being nearby.
// Match the destination, never an origin casually mentioned in the description.
export function matchesOutingArea(idea: ExplorationIdea, filters: ExplorationFilters, area?: OutingArea): boolean {
  if (idea.category !== "outside" || !shortLocalOuting(filters, area)) return true;
  if (!idea.place?.trim()) return false;
  const destination = idea.place;
  if (/国家博物馆|国家图书馆|国博|国图|天安门|海淀|朝阳|东城区|西城区|通州|首创奥[特莱]*|龙湖北京房山天街|房山龙湖天街/.test(destination)) return false;
  return /阳光邑上|昊天公园|熙悦天街|良乡东路\s*56号/.test(destination);
}

export function outingGuidance(filters: ExplorationFilters, area?: OutingArea) {
  const local = shortLocalOuting(filters, area);
  return {
    scope: local ? "只选良乡阳光邑上附近，优先阳光邑上周边街边店、昊天公园、北京熙悦天街一带。" : "北京全城均可，不因出发地在良乡而排除远处。国家博物馆、国家图书馆等可以推荐。",
    rule: local ? "place 必须写目标店铺或地点的准确分店、所在街区，能确认属于上述附近区域。不能只写房山、良乡或把出发地写进简介充当附近证据。核对位置和步行路线，10～30分钟不推荐需要横跨城区的地点；找不到可靠附近地点时少给，不用远处补位。" : "时长指在目的地的一次体验，不包含往返；较长时段不设置距离上限。",
    everyday: "出门不必变成参观学习。逛一家没去过的小店、买一块想吃的蛋糕、尝一杯饮料、逛文具或文创、听现场、逛商场、拍照、看展、散步都可以。探索店铺、甜品、小吃、商品和地方生活也算有意思的活动，与博物馆、图书馆、公园轮换。",
    evidence: "指定店铺、分店和地点必须检索核实；不能编造店铺、库存、价格或营业时间。买什么可以留给用户选。不要把每个出门建议都变成去公园观察或读展板。",
    ...(area === localOutingArea ? { preference: "用户喜欢国家博物馆、国家图书馆的推荐，也愿意探索一家店、去天街买麦德林蛋糕。长时段保留国博、国图，不要反复重推。蛋糕是想做的事，不是某家店当前有货的证据；短时段店铺仍须符合附近位置要求。" } : {}),
  };
}
