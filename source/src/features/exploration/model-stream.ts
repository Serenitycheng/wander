import { isObject } from "./discovery.ts";

// Only complete objects are publishable. Braces inside quoted text, escaped
// quotes and an unfinished final card must never become a partial suggestion.
export function completeIdeaObjects(text: string): unknown[] {
  const start = /"ideas"\s*:\s*\[/.exec(text);
  if (!start) return [];
  const ideas: unknown[] = [];
  let quoted = false, escaped = false, depth = 0, objectStart = -1;
  for (let index = start.index + start[0].length; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === "{" || char === "[") {
      if (depth === 0 && char === "{") objectStart = index;
      depth++;
    } else if (char === "}" || char === "]") {
      if (depth === 0) break;
      depth--;
      if (depth === 0 && objectStart >= 0) {
        try { ideas.push(JSON.parse(text.slice(objectStart, index + 1))); } catch { return ideas; }
        objectStart = -1;
        if (ideas.length >= 12) break;
      }
    }
  }
  return ideas;
}

// The existing Anthropic-compatible endpoint can also return ordinary JSON.
// Search tool blocks remain in every snapshot, so streaming does not weaken
// URL verification or the final preference/exclusion boundary.
export async function readModelResponse(response: Response, signal: AbortSignal,
  onSnapshot: (payload: unknown) => void): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const blocks = new Map<number, Record<string, unknown>>();
  let pending = "", size = 0;
  const snapshot = () => ({ content: [...blocks.values()].map((block) => block.type === "text" && typeof block.text === "string"
    ? { ...block, text: JSON.stringify({ ideas: completeIdeaObjects(block.text) }) } : block) });
  const event = (frame: string) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    const value: unknown = JSON.parse(data);
    if (!isObject(value)) return;
    if (value.type === "error") throw new Error("MODEL_STREAM_ERROR");
    if (value.type === "content_block_start" && Number.isInteger(value.index) && isObject(value.content_block)) {
      blocks.set(Number(value.index), { ...value.content_block });
    } else if (value.type === "content_block_delta" && isObject(value.delta)) {
      const block = blocks.get(Number(value.index));
      if (block?.type === "text" && value.delta.type === "text_delta" && typeof value.delta.text === "string") {
        block.text = String(block.text ?? "") + value.delta.text;
      }
    }
    onSnapshot(snapshot());
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      size += chunk.value?.byteLength ?? 0;
      if (size > 1_500_000) throw new SyntaxError("Model stream too large");
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        event(pending.slice(0, boundary.index));
        pending = pending.slice(boundary.index + boundary[0].length);
      }
      if (chunk.done) { if (pending.trim()) event(pending); break; }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return snapshot();
}
