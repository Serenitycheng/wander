"use client";

import Link from "next/link";
import { ArrowRight, Bookmark, Sparkles } from "lucide-react";
import { useState } from "react";
import { categoryLabels } from "../types";
import type { ExplorationCategory } from "../types";
import { useExploration } from "./exploration-app";
import { IdeaCard } from "./idea-card";

export function FavoritesPage() {
  const { space, toggleSoon, toggleFavorite, resolveIdea } = useExploration();
  const [filter, setFilter] = useState<"all" | "soon" | ExplorationCategory>(
    "all",
  );
  const categories: ExplorationCategory[] = [
    "outside",
    "home",
    "learn",
    "create",
  ];
  const favorites = space.favorites
    .flatMap((favorite) => {
      const idea = resolveIdea(favorite.ideaId);
      return idea ? [{ favorite, idea }] : [];
    })
    .filter(
      ({ favorite, idea }) =>
        filter === "all" ||
        (filter === "soon" ? favorite.soon : idea.category === filter),
    )
    .sort(
      (left, right) => Number(right.favorite.soon) - Number(left.favorite.soon),
    );
  const unavailable = space.favorites.filter((item) => !resolveIdea(item.ideaId));
  return (
    <div className="exploration-page">
      <header className="exploration-page-heading">
        <span className="exploration-eyebrow">什么时候想试，都可以</span>
        <h1>先放在这里。</h1>
        <p>一些让你好奇的事，没有截止日期。</p>
      </header>
      <div
        className="exploration-choice-row exploration-favorite-filters"
        aria-label="收藏分类"
      >
        <button
          type="button"
          aria-pressed={filter === "all"}
          className={filter === "all" ? "selected" : ""}
          onClick={() => setFilter("all")}
        >
          全部
        </button>
        <button
          type="button"
          aria-pressed={filter === "soon"}
          className={filter === "soon" ? "selected" : ""}
          onClick={() => setFilter("soon")}
        >
          <Sparkles size={15} />
          最近想试
        </button>
        {categories.map((category) => (
          <button
            type="button"
            key={category}
            aria-pressed={filter === category}
            className={filter === category ? "selected" : ""}
            onClick={() => setFilter(category)}
          >
            {categoryLabels[category]}
          </button>
        ))}
      </div>
      {favorites.length ? (
        categories.map((category) => {
          const group = favorites.filter(
            (item) => item.idea.category === category,
          );
          return group.length ? (
            <section key={category} className="exploration-favorite-group">
              <h2>{categoryLabels[category]}</h2>
              <div className="exploration-card-grid">
                {group.map(({ idea, favorite }) => (
                  <div key={idea.id}>
                    <IdeaCard
                      compact
                      suggestion={{ idea, reasons: [idea.why] }}
                    />
                    <button
                      type="button"
                      className={`exploration-soon-toggle${favorite.soon ? " selected" : ""}`}
                      aria-pressed={favorite.soon}
                      onClick={() => toggleSoon(idea.id)}
                    >
                      <Sparkles size={14} />
                      {favorite.soon
                        ? "最近想试 · 已放在前面"
                        : "标记为最近想试"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null;
        })
      ) : (
        <div className="exploration-empty-page">
          <Bookmark size={35} strokeWidth={1.1} />
          <h2>
            {filter === "soon"
              ? "想起哪件事时，再放到前面。"
              : space.favorites.length
                ? "这个方向还留着一点空白。"
                : "把好奇心，先留在这里。"}
          </h2>
          <p>
            {filter === "soon"
              ? "在收藏下面点「最近想试」，就能把它放到前面。"
              : "遇见一个感兴趣的小入口，点一下收藏就好。"}
          </p>
          <Link href="/explore" className="exploration-secondary">
            去探索看看 <ArrowRight size={16} />
          </Link>
        </div>
      )}
      {unavailable.length ? (
        <div className="exploration-unknown-favorites">
          <p>这几条旧收藏暂未在当前内容库中收录，原收藏仍保留着。</p>
          {unavailable.map((item) => (
            <div key={item.ideaId}>
              <span>{item.ideaId}</span>
              <button type="button" onClick={() => toggleFavorite(item.ideaId)}>
                移开这条收藏
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
