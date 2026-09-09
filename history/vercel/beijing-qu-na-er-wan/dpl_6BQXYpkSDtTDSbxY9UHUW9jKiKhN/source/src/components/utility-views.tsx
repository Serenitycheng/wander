"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, CloudSun, ExternalLink, History, LoaderCircle, Plus, Search, Sparkles } from "lucide-react";
import type { AmapWeather } from "@/lib/amap-types";
import type { WeekItem, WeekSearchResult } from "@/lib/week-types";

const verifiedTime = (value: string) => new Intl.DateTimeFormat("zh-CN", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai",
}).format(new Date(value));

function WeekItemCard({ item }: { item: WeekItem }) {
  const official = item.verification === "official";
  return (
    <article className="week-item-card">
      <div className="week-item-top"><span className={`source-pill ${official ? "official" : "community"}`}>{official ? <CheckCircle2 size={13} /> : <Sparkles size={13} />}{official ? "官方来源" : "小红书线索 · 未核验"}</span><span>{item.category}</span></div>
      <h4>{item.title}</h4>
      <p>{item.summary}</p>
      <dl><div><dt>时间</dt><dd>{item.dateText}</dd></div><div><dt>地点</dt><dd>{item.venue}</dd></div><div><dt>核验</dt><dd>{verifiedTime(item.lastVerified)}</dd></div></dl>
      <a href={item.sourceUrl} target="_blank" rel="noreferrer">打开 {item.sourceName || (official ? "官方页面" : "原笔记")} <ExternalLink size={14} /></a>
    </article>
  );
}

export function WeekView({ onStart, amapConfigured, deepseekConfigured }: { onStart: () => void; amapConfigured: boolean; deepseekConfigured: boolean }) {
  const [weather, setWeather] = useState<AmapWeather | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<WeekSearchResult | null>(null);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">("idle");
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    if (!amapConfigured) return;
    fetch("/api/amap/weather")
      .then(async (response) => {
        const payload = await response.json() as AmapWeather & { error?: string };
        if (!response.ok) throw new Error(payload.error || "天气暂时无法获取");
        setWeather(payload);
      })
      .catch((error) => setWeatherError(error instanceof Error ? error.message : "天气暂时无法获取"));
  }, [amapConfigured]);

  const xhsQuery = useMemo(() => query.trim() || "北京 本周 展览 演出 快闪 周末活动", [query]);
  const xhsSearchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(xhsQuery)}`;

  const searchWeek = async () => {
    setSearchState("loading");
    setSearchError("");
    try {
      const response = await fetch("/api/week/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(50_000),
      });
      const payload = await response.json().catch(() => null) as (WeekSearchResult & { error?: string }) | null;
      if (!payload) throw new Error(`本周检索接口返回了无法读取的内容（${response.status}）`);
      if (!response.ok) throw new Error(payload.error || "本周内容暂时无法检索");
      setResult(payload);
      setSearchState("idle");
    } catch (error) {
      setSearchState("error");
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      setSearchError(timedOut ? "联网检索超时，请换一个更具体的关键词后重试" : error instanceof Error ? error.message : "本周内容暂时无法检索");
    }
  };

  return (
    <section className="utility-view week-view">
      <div className="utility-hero week-hero">
        <span className="utility-icon"><CalendarDays size={28} /></span>
        <span className="section-kicker">本周发生</span>
        <h2>先查证，再决定去哪儿。</h2>
        <p>官方来源用于确认日期、地点和开放状态；小红书只用于发现体验线索。联网结果会经过域名与日期校验，过期或来源不合格的内容不会展示。</p>
        <div className="week-search-box">
          <label><Search size={17} /><input aria-label="本周活动检索偏好" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} placeholder="可选：输入偏好，例如‘手作、海淀、周日下午’" /></label>
          <button className="primary-button" type="button" onClick={() => void searchWeek()} disabled={!deepseekConfigured || searchState === "loading"}>{searchState === "loading" ? <span className="spin"><LoaderCircle size={17} /></span> : <Sparkles size={17} />}{searchState === "loading" ? "正在联网查证…" : "联网刷新本周内容"}</button>
          <a className="secondary-button" href={xhsSearchUrl} target="_blank" rel="noreferrer">补充打开小红书 <ExternalLink size={15} /></a>
        </div>
        <small className="week-data-note">点击联网刷新时，只把上方检索词发送给 DeepSeek；不要在这里填写姓名、住址或其他隐私。</small>
        {!deepseekConfigured ? <div className="truth-banner compact"><AlertCircle size={17} /><span>DeepSeek 尚未配置，因此不能自动联网整理；仍可以直接打开小红书搜索。</span></div> : null}
        {searchState === "error" ? <div className="truth-banner compact"><AlertCircle size={17} /><span>{searchError} 页面没有用虚构内容补位。</span></div> : null}
        <button className="icon-text-button week-start" type="button" onClick={onStart}><Plus size={17} /> 不看动态内容，直接用基础活动库决定</button>
      </div>

      <section className="week-panel">
        <div className="panel-heading"><div><span className="section-kicker">高德天气</span><h3>{weather ? `${weather.city}未来天气` : "天气与户外判断"}</h3></div><CloudSun size={21} /></div>
        {weather ? <><div className="weather-grid">{weather.days.map((day) => <div key={day.date}><strong>{day.date.slice(5).replace("-", "/")}</strong><span>{day.dayWeather}{day.nightWeather !== day.dayWeather ? `转${day.nightWeather}` : ""}</span><b>{day.nightTemp}°—{day.dayTemp}°</b><small>{day.dayWind}风</small></div>)}</div><p className="source-note">高德天气 · 发布时间 {weather.reportTime || "未提供"}。花期仍以公园官方公告为准。</p></> : <div className="week-empty">{weatherError || (amapConfigured ? "正在获取天气…" : "高德天气尚未配置")}</div>}
      </section>

      {result ? (
        <>
          <section className="week-panel">
            <div className="panel-heading"><div><span className="section-kicker">{result.periodLabel}</span><h3>官方已核验</h3></div><span className="soft-badge">{result.officialItems.length} 条</span></div>
            {result.officialItems.length ? <div className="week-item-grid">{result.officialItems.map((item) => <WeekItemCard item={item} key={item.id} />)}</div> : <div className="week-empty">本次没有找到同时满足“官方来源 + 日期有效”的内容。可以换一个关键词再查。</div>}
          </section>
          <section className="week-panel community-panel">
            <div className="panel-heading"><div><span className="section-kicker">用户经验层</span><h3>小红书公开线索</h3></div><span className="soft-badge warning">不作为事实依据</span></div>
            {result.xiaohongshuItems.length ? <div className="week-item-grid">{result.xiaohongshuItems.map((item) => <WeekItemCard item={item} key={item.id} />)}</div> : <div className="week-empty">没有检索到可公开访问且日期有效的小红书页面。你仍可使用上方按钮进入小红书站内搜索。</div>}
            {result.discardedCount ? <p className="source-note">另有 {result.discardedCount} 条结果因来源域名或日期不合格而未展示。</p> : null}
          </section>
        </>
      ) : (
        <div className="utility-grid"><div><CloudSun size={20} /><strong>天气与花期</strong><span>天气自动读取，花期只认官方公告</span><small>{amapConfigured ? "天气已接入" : "高德待配置"}</small></div><div><Sparkles size={20} /><strong>展演与快闪</strong><span>点击联网刷新后才产生检索费用</span><small>{deepseekConfigured ? "可以检索" : "DeepSeek 待配置"}</small></div><div><AlertCircle size={20} /><strong>过期保护</strong><span>日期不在未来 7 天或来源不合格时自动丢弃</span><small>已启用</small></div></div>
      )}
    </section>
  );
}

export function HistoryView({ hasSavedTrip, onStart }: { hasSavedTrip: boolean; onStart: () => void }) {
  return (
    <section className="utility-view">
      <div className="utility-hero"><span className="utility-icon"><History size={28} /></span><span className="section-kicker">Serenity 的空间</span><h2>{hasSavedTrip ? "已经保存 1 次本机预览方案。" : "还没有保存过出行方案。"}</h2><p>正式接入云端后，行程只保存在发起人空间；Serenity 可以查看 zzz 的空间，但默认不覆盖对方数据。</p><button className="primary-button inline" type="button" onClick={onStart}><Plus size={17} /> 新建一次出行</button></div>
    </section>
  );
}
