"use client";

import { AlertCircle, ArrowRight, Clock3, Filter, Search, SlidersHorizontal, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { activities, activityCategories, activityCountFromReference } from "@/features/beijing/lib/activity-data";
import type { ActivityCategory } from "@/features/beijing/lib/types";

type LibraryViewProps = { onUseActivity: () => void };

export function LibraryView({ onUseActivity }: LibraryViewProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ActivityCategory | "全部">("全部");
  const [indoorOnly, setIndoorOnly] = useState(false);

  const filtered = useMemo(() => activities.filter((item) => {
    const matchesQuery = !query || [item.name, item.category, item.venue, item.area, ...item.tags].join(" ").toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "全部" || item.category === category;
    return matchesQuery && matchesCategory && (!indoorOnly || item.indoor);
  }), [category, indoorOnly, query]);

  return (
    <section className="library-view">
      <div className="library-heading"><div><span className="section-kicker">活动类型层 · v1</span><h2>先知道“还能玩什么”。</h2><p>参考原 PDF 整理了 {activityCountFromReference} 个方向，当前首批录入 {activities.length} 个结构化条目；地点商户层和当周内容层分开维护。</p></div><button className="primary-button inline" type="button" onClick={onUseActivity}>拿这些活动去做决定 <ArrowRight size={17} /></button></div>

      <div className="library-toolbar">
        <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索陶艺、夜游、铁路、雨天…" /></label>
        <button className={indoorOnly ? "filter-toggle active" : "filter-toggle"} type="button" onClick={() => setIndoorOnly((value) => !value)}><Filter size={16} /> 只看室内</button>
        <span className="result-count">{filtered.length} 个结果</span>
      </div>

      <div className="category-strip" aria-label="活动分类">
        {["全部", ...activityCategories].map((item) => <button key={item} className={category === item ? "category-filter active" : "category-filter"} type="button" onClick={() => setCategory(item as ActivityCategory | "全部")}>{item}</button>)}
      </div>

      <div className="library-grid">
        {filtered.map((item) => (
          <article className="activity-card" key={item.id}>
            <div className="activity-card-top"><span>{item.category}</span><span className={`source-state ${item.verification === "基础资料" ? "base" : "verify"}`}>{item.verification}</span></div>
            <h3>{item.name}</h3>
            <p>{item.venue} · {item.area}</p>
            <div className="activity-metrics"><span><Clock3 size={14} /> {item.durationHours[0]}–{item.durationHours[1]} 小时</span><span><WalletCards size={14} /> ¥{item.budgetYuan[0]}–{item.budgetYuan[1]}</span></div>
            <div className="tag-row">{item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="activity-takeaway"><strong>{item.takeaway}</strong><small>{item.caveat}</small></div>
          </article>
        ))}
      </div>

      {filtered.length === 0 ? <div className="empty-state"><SlidersHorizontal size={30} /><h3>没有完全匹配的条目</h3><p>换一个分类或清空搜索词，活动本身不会被删除。</p></div> : null}
      <div className="truth-banner"><AlertCircle size={18} /><span>基础活动库是决策素材，不代表商户当前营业。商户与当周事件会在第二层、第三层单独标注来源与核验时间。</span></div>
    </section>
  );
}
