"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  NotebookPen,
} from "lucide-react";
import { minutesLabel, categoryLabels } from "../types";
import type { ExplorationIdea } from "../types";
import { reasonsFor } from "../generator";
import { useExploration } from "./exploration-app";
import { ModeIcon } from "./idea-card";

export function IdeaDetail({ idea }: { idea: ExplorationIdea }) {
  const { space, toggleFavorite, owner } = useExploration();
  const saved = space.favorites.some((item) => item.ideaId === idea.id);
  const link = idea.source?.action
    ? idea.source.url
    : idea.place
      ? `https://www.amap.com/search?query=${encodeURIComponent(idea.place)}&city=110000`
      : idea.search
        ? `https://www.bing.com/search?q=${encodeURIComponent(idea.search)}`
        : null;
  return (
    <article className={`exploration-detail category-${idea.category}`}>
      <Link href="/explore" className="exploration-text-link">
        <ArrowLeft size={16} />
        回到探索
      </Link>
      <header className="exploration-detail-heading">
        <span className="exploration-category">
          <ModeIcon mode={idea.category} />
          {categoryLabels[idea.category]}
        </span>
        <h1>{idea.title}</h1>
        <span className="exploration-duration">
          {minutesLabel(idea.minutes)}
          {idea.place ? " · 北京 · 不含往返" : ""}
        </span>
      </header>
      <section className="exploration-detail-block">
        <span className="exploration-eyebrow">这是什么</span>
        <p>{idea.description}</p>
      </section>
      <section className="exploration-detail-block">
        <span className="exploration-eyebrow">推荐理由</span>
        <ul>
          {reasonsFor(idea).map((reason) => (
            <li key={reason}>
              <Check size={15} strokeWidth={1.5} />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="exploration-first-step">
        <span className="exploration-eyebrow">开始方式</span>
        <p>{idea.firstStep}</p>
        {link ? (
          <a
            className="exploration-primary"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {idea.source?.action ?? (idea.place ? "打开地图" : "搜索这个主题")}
            <ArrowUpRight size={17} />
          </a>
        ) : null}
      </section>
      <div className="exploration-detail-actions">
        <button
          className="exploration-secondary"
          type="button"
          aria-pressed={saved}
          onClick={() => toggleFavorite(idea.id)}
        >
          <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
          {saved ? "已收藏" : "收藏"}
        </button>
        <Link
          className="exploration-text-link"
          href={`/records?idea=${idea.id}`}
        >
          <NotebookPen size={17} />
          添加记录
        </Link>
      </div>
      {idea.source ? (
        <p className="exploration-detail-source">
          {idea.place ? "地点线索：" : "内容参考："}
          <a href={idea.source.url} target="_blank" rel="noopener noreferrer">
            {idea.source.name} <ArrowUpRight size={12} />
          </a>{" "}
          {idea.place ? "· 不代表当日开放或展览信息" : null}
        </p>
      ) : null}
      {idea.category === "outside" ? (
        <Link
          href={`/beijing?space=${owner}`}
          className="exploration-city-detail"
        >
          想约朋友一起？北京模块可以分别填写偏好、查看路线。
          <ArrowUpRight size={15} />
        </Link>
      ) : null}
    </article>
  );
}

export function DiscoveredIdeaDetail({ id }: { id: string }) {
  const { resolveIdea } = useExploration();
  const idea = resolveIdea(id);
  return idea ? <IdeaDetail idea={idea} /> : (
    <div className="exploration-empty-page">
      <h1>这个入口还没保存在当前空间。</h1>
      <p>在线内容保存在发现它的浏览器和账号里。可以导入包含它的备份，或回到探索再看看。</p>
      <Link href="/explore" className="exploration-secondary">回到探索 <ArrowUpRight size={16} /></Link>
    </div>
  );
}
