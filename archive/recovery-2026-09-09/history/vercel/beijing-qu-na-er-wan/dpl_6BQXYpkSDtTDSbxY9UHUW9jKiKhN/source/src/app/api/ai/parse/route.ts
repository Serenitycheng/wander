import { NextResponse } from "next/server";

const allowedInterests = [
  "手作与创作",
  "运动与挑战",
  "表演与声音",
  "自然与户外",
  "城市与摄影",
  "食物与感官",
  "阅读与文化",
  "科技与创客",
  "展览与现场",
  "轻松社交",
] as const;

const allowedVibes = ["想带回作品", "想学一个新技能", "轻松恢复", "想拍照", "想看当周内容", "来点没试过的"] as const;
const allowedVetoes = ["怕高 / 高空", "水上项目", "不想运动", "不想户外 / 怕晒", "人多拥挤", "夜间太晚", "高消费", "强社交表达"] as const;

type DeepSeekCompletion = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const uniqueStrings = (value: unknown, limit: number, maxLength = 60) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    .map((item) => item.slice(0, maxLength))
    .slice(0, limit);
};

const allowOnly = <T extends string>(value: unknown, allowed: readonly T[]) => {
  const allowedSet = new Set<string>(allowed);
  return uniqueStrings(value, allowed.length).filter((item): item is T => allowedSet.has(item));
};

export async function POST(request: Request) {
  let body: { text?: unknown; consent?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
  }

  if (body.consent !== true) {
    return NextResponse.json(
      { error: "请先确认允许将本轮补充文字发送给 DeepSeek；具体地址不会发送。", code: "CONSENT_REQUIRED" },
      { status: 403 },
    );
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "请先填写需要 DeepSeek 理解的补充文字。" }, { status: 400 });
  if (text.length > 1200) return NextResponse.json({ error: "补充文字请控制在 1200 字以内。" }, { status: 400 });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DeepSeek API Key 尚未配置。", code: "DEEPSEEK_NOT_CONFIGURED" }, { status: 503 });
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `你是“北京去哪儿玩”的偏好解析器。只解析用户主动填写的补充文字，不猜测身份、住址或其他个人信息。必须只输出一个 JSON 对象，结构为：{"summary":"不超过80字的概括","interests":[],"vibes":[],"vetoes":[],"constraints":[]}。interests 只能从 ${JSON.stringify(allowedInterests)} 中选择；vibes 只能从 ${JSON.stringify(allowedVibes)} 中选择；vetoes 只能从 ${JSON.stringify(allowedVetoes)} 中选择；constraints 放最多 6 条无法归入上述枚举的时间、天气、节奏或体验约束。没有依据的字段返回空数组。`,
          },
          { role: "user", content: `请将以下出行偏好解析为 JSON：\n${text}` },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature: 0.2,
        max_tokens: 700,
        stream: false,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `DeepSeek 暂时没有成功响应（${response.status}），请稍后重试。`, code: "DEEPSEEK_UPSTREAM_ERROR" },
        { status: 502 },
      );
    }

    const completion = (await response.json()) as DeepSeekCompletion;
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("EMPTY_DEEPSEEK_RESPONSE");

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const analysis = {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 160) : "",
      interests: allowOnly(parsed.interests, allowedInterests),
      vibes: allowOnly(parsed.vibes, allowedVibes),
      vetoes: allowOnly(parsed.vetoes, allowedVetoes),
      constraints: uniqueStrings(parsed.constraints, 6),
    };

    return NextResponse.json({ analysis, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: timedOut ? "DeepSeek 响应超时，请稍后重试。" : "DeepSeek 返回内容无法解析，请重试。", code: timedOut ? "DEEPSEEK_TIMEOUT" : "DEEPSEEK_INVALID_RESPONSE" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
