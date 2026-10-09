import "server-only";
import { discoverWithProviders } from "@/features/exploration/discovery-service";
import type { DiscoveryRequest } from "@/features/exploration/online-discovery";
import type { DiscoveryResult } from "@/features/exploration/discovery-status";

export type { DiscoveryRequest } from "@/features/exploration/online-discovery";

export function discoverOnlineIdeas(request: DiscoveryRequest, signal: AbortSignal, onResult?: (result: DiscoveryResult) => void) {
  return discoverWithProviders(request, signal, {
    key: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.EXPLORATION_DEEPSEEK_BASE_URL ?? process.env.DEEPSEEK_BASE_URL,
    model: process.env.EXPLORATION_DEEPSEEK_MODEL,
    log: (entry) => console.info(JSON.stringify(entry)),
    onResult,
  });
}
