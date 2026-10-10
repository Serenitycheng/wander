import { isObject, parseDiscoveryResponse } from "./discovery.ts";
import { sameExperience } from "./activity-affinity.ts";
import type { ExplorationIdea, ExplorationSuggestion } from "./types.ts";

const issues = [
  "not_configured", "login_required", "forbidden", "rate_limited", "timeout", "network_error",
  "key_rejected", "quota_exceeded", "request_rejected", "provider_unavailable",
  "no_search_results", "invalid_response", "no_new_results", "invalid_request", "service_unavailable",
] as const;
export type DiscoveryIssue = typeof issues[number];
export type DiscoveryResult = {
  ideas: ExplorationIdea[];
  provider: "deepseek" | "public" | "none" | "unknown";
  issue?: DiscoveryIssue;
  httpStatus?: number;
};

export const isDiscoveryFailure = (result: DiscoveryResult): boolean =>
  !!result.issue && !["no_new_results", "no_search_results"].includes(result.issue);

export const canRetryDiscovery = (result: DiscoveryResult): boolean =>
  !!result.issue && ["network_error", "service_unavailable", "provider_unavailable", "invalid_response"].includes(result.issue);

export function parseDiscoveryResult(value: unknown): DiscoveryResult {
  if (!isObject(value) || !Array.isArray(value.ideas))
    return { ideas: [], provider: "none", issue: "invalid_response" };
  const ideas = parseDiscoveryResponse(value);
  const provider = isObject(value) && ["deepseek", "public", "none"].includes(String(value.provider))
    ? value.provider as DiscoveryResult["provider"] : ideas.length ? "unknown" : "none";
  const issue = value.ideas.length && !ideas.length ? "invalid_response"
    : issues.includes(value.issue as DiscoveryIssue) ? value.issue as DiscoveryIssue : undefined;
  return { ideas, provider, ...(issue ? { issue } : {}),
    ...(Number.isInteger(value.httpStatus) && Number(value.httpStatus) >= 400 && Number(value.httpStatus) <= 599 ? { httpStatus: Number(value.httpStatus) } : {}) };
}

const issueNotes: Record<DiscoveryIssue, string> = {
  not_configured: "DeepSeek 尚未配置。",
  login_required: "登录已失效，请重新登录以获取新内容。",
  forbidden: "本次联网请求被拒绝，请刷新页面后再试。",
  rate_limited: "请求太频繁，稍等片刻再试。",
  timeout: "本次联网发现超时。",
  network_error: "本次未能连接到发现服务。",
  invalid_request: "本次探索信息未被服务接受，请刷新后再试。",
  service_unavailable: "发现服务暂时无法响应。",
  key_rejected: "DeepSeek 密钥未通过验证。",
  quota_exceeded: "DeepSeek 账户额度不足。",
  request_rejected: "DeepSeek 拒绝了搜索请求，需要检查模型或接口配置。",
  provider_unavailable: "DeepSeek 暂时无法响应。",
  no_search_results: "DeepSeek 未返回可核验的网页搜索结果。",
  invalid_response: "本次搜索结果未能解析为可用建议。",
  no_new_results: "本次搜索没有符合条件的新内容。",
};

export function discoveryNoteFor(result: DiscoveryResult, suggestions: ExplorationSuggestion[], shownIds: string[] = [], recentIdeas: ExplorationIdea[] = []): string {
  const liveIds = new Set(result.ideas.map((idea) => idea.id));
  const live = suggestions.filter(({ idea }) => liveIds.has(idea.id)).length;
  const cached = suggestions.filter(({ idea }) => idea.discoveredAt && !liveIds.has(idea.id)).length;
  const local = suggestions.length - live - cached;
  const parts: string[] = [];
  if (live) parts.push(`${result.provider === "deepseek" ? "DeepSeek 推荐" : result.provider === "public" ? "公开来源发现" : "联网发现"} ${live} 个`);
  if (cached) parts.push(`此前发现 ${cached} 个`);
  if (local) parts.push(`本地灵感 ${local} 个`);
  const counts = parts.join(" · ");
  const repeats = suggestions.filter(({ idea }) => shownIds.includes(idea.id) || recentIdeas.some((previous) => sameExperience(previous, idea))).length;
  const repeatNote = repeats ? ` 这组有 ${repeats} 个之前看过的选择，当前条件下新内容暂时不足。` : "";
  return (result.issue ? `${issueNotes[result.issue]}${counts ? ` 本轮：${counts}。` : ""}` : `${counts}。`) + repeatNote;
}
