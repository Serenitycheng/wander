import "server-only";

type DeepSeekOutput = {
  type?: string;
  status?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type DeepSeekResponse = {
  status?: "in_progress" | "completed" | "incomplete" | "failed";
  incomplete_details?: { reason?: string } | null;
  error?: { code?: string; message?: string } | null;
  output_text?: string;
  output?: DeepSeekOutput[];
};

export class DeepSeekRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeepSeekRequestError";
  }
}

const responseText = (payload: DeepSeekResponse) => {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output ?? []) {
    const text = item.content?.find((part) => part.type === "output_text" && part.text)?.text
      ?? (item.type === "message" ? item.content?.find((part) => part.text)?.text : undefined);
    if (text) return text;
  }
  return "";
};

const parseJson = <T>(value: string): T => {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new DeepSeekRequestError("INVALID_JSON", 502, "联网结果不是可用的结构化数据。");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
};

type StructuredSearchOptions = {
  route: string;
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
};

export async function deepSeekStructuredSearch<T>({
  route,
  schemaName,
  schema,
  instructions,
  input,
  timeoutMs = 32_000,
  maxOutputTokens = 2_400,
}: StructuredSearchOptions): Promise<T> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new DeepSeekRequestError("NOT_CONFIGURED", 503, "DeepSeek API Key 尚未配置。");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const startedAt = Date.now();
  console.info(`[${route}] DeepSeek web search started`, { model });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions,
        input,
        reasoning: { effort: "none" },
        max_output_tokens: maxOutputTokens,
        temperature: 0.2,
        tools: [{ type: "web_search" }],
        text: { format: { type: "json_schema", name: schemaName, schema } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    console.error(`[${route}] DeepSeek web search transport failed`, { durationMs: Date.now() - startedAt, timedOut, error: String(error) });
    throw new DeepSeekRequestError(timedOut ? "TIMEOUT" : "NETWORK", 502, timedOut ? "联网检索超时，请稍后重试。" : "暂时无法连接联网检索服务。");
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 900);
    console.error(`[${route}] DeepSeek web search rejected`, { durationMs: Date.now() - startedAt, status: response.status, detail });
    const authenticationFailed = response.status === 401 || response.status === 403;
    throw new DeepSeekRequestError(authenticationFailed ? "AUTHENTICATION_FAILED" : "UPSTREAM_REJECTED", 502, authenticationFailed ? "DeepSeek 密钥鉴权失败，请检查 Vercel 中的密钥。" : `DeepSeek 联网检索返回 ${response.status}，请稍后重试。`);
  }

  const payload = await response.json() as DeepSeekResponse;
  if (payload.status === "failed" || payload.error) {
    console.error(`[${route}] DeepSeek web search failed`, { durationMs: Date.now() - startedAt, status: payload.status, error: payload.error });
    throw new DeepSeekRequestError("UPSTREAM_FAILED", 502, payload.error?.message || "DeepSeek 联网检索没有完成。");
  }
  const text = responseText(payload);
  if (!text) {
    console.error(`[${route}] DeepSeek web search returned no text`, {
      durationMs: Date.now() - startedAt,
      status: payload.status,
      incompleteReason: payload.incomplete_details?.reason,
      output: (payload.output ?? []).map((item) => ({ type: item.type, status: item.status, contentTypes: item.content?.map((part) => part.type) })),
    });
    throw new DeepSeekRequestError("EMPTY_RESULT", 502, "DeepSeek 联网检索没有返回可用内容。");
  }

  try {
    const result = parseJson<T>(text);
    console.info(`[${route}] DeepSeek web search completed`, { durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.error(`[${route}] DeepSeek structured output invalid`, { durationMs: Date.now() - startedAt, error: String(error), preview: text.slice(0, 500) });
    if (error instanceof DeepSeekRequestError) throw error;
    throw new DeepSeekRequestError("INVALID_JSON", 502, "DeepSeek 返回的联网结果无法解析。");
  }
}
