import type { ExplorationFilters, ExplorationIdea, SpaceOwner } from "./types.ts";

export const localOutingArea = "liangxiang-yangguangyishang" as const;
export type OutingArea = typeof localOutingArea;
export const outingAreaFor = (owner: SpaceOwner): OutingArea | undefined => owner === "serenity" ? localOutingArea : undefined;

export const shortLocalOuting = (filters: ExplorationFilters, area?: OutingArea) =>
  area === localOutingArea && filters.time === "short";

// User-chosen public surroundings do not claim that a named venue exists,
// has stock, or admits visitors. Named places still need verified sources.
export const isOpenOutingPlace = (place: unknown) => typeof place === "string" &&
  /^(住处附近|附近街区|附近学校周边|阳光邑上周边|阳光邑上周边街区|阳光邑上附近学校周边|阳光邑上周边公共空间)$/.test(place);

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
    scope: local ? "只选良乡阳光邑上附近，包括周边街区、小店、学校周边和可进入的公共空间；昊天公园、北京熙悦天街一带也可以，不必围着这两个地点反复推荐。" : "北京全城均可，不因出发地在良乡而排除远处。国家博物馆、国家图书馆等可以推荐。",
    rule: local ? "place 必须写目标店铺或地点的准确分店、所在街区，能确认属于上述附近区域。不能只写房山、良乡或把出发地写进简介充当附近证据。核对位置和步行路线，10～30分钟不推荐需要横跨城区的地点；找不到可靠附近地点时少给，不用远处补位。" : "时长指在目的地的一次体验，不包含往返；较长时段不设置距离上限。",
    everyday: "出门不必变成参观学习。逛一家没去过的小店、买一块想吃的蛋糕、尝一杯饮料、逛文具或文创、听现场、逛商场、拍照、看展、散步都可以。探索店铺、甜品、小吃、商品和地方生活也算有意思的活动，与博物馆、图书馆、公园轮换。",
    evidence: "指定店铺、分店和地点必须检索核实；不能编造店铺、库存、价格或营业时间。买什么可以留给用户选。不要把每个出门建议都变成去公园观察或读展板。",
    openActivities: "也可推荐不依赖命名地点的开放活动：用户在附近街区或学校周边自己选地方，实际做点什么，例如带球去允许使用的公共场地、和朋友拍一段短片、试一种街头摄影方式、逛街时挑一家自己想进的小店。不要把这些例子当固定清单。学校内部只有明确允许公众进入时才去，不能声称某所学校开放。此类不涉及外部事实的活动可不附来源，approach=open，place 只能用住处附近/附近街区/附近学校周边/阳光邑上周边/阳光邑上周边街区/阳光邑上附近学校周边/阳光邑上周边公共空间；短时段必须用阳光邑上开头的地点。具体学校、店铺、工具和资源仍必须核实。",
    ...(area === localOutingArea ? { preference: "用户喜欢国家博物馆、国家图书馆的推荐，也愿意探索一家店、去天街买麦德林蛋糕。长时段保留国博、国图，不要反复重推。蛋糕是想做的事，不是某家店当前有货的证据；短时段店铺仍须符合附近位置要求。" } : {}),
  };
}
