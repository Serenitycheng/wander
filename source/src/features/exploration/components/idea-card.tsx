"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Footprints,
  House,
  Palette,
  Shuffle,
} from "lucide-react";
import { categoryLabels, minutesLabel } from "../types";
import type { ExplorationMode, ExplorationSuggestion } from "../types";
import { useExploration } from "./exploration-app";

const icons = {
  outside: Footprints,
  home: House,
  learn: BookOpen,
  create: Palette,
  random: Shuffle,
};
export function ModeIcon({
  mode,
  size = 21,
}: {
  mode: ExplorationMode;
  size?: number;
}) {
  const Icon = icons[mode];
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
export function IdeaCard({
  suggestion,
  compact = false,
}: {
  suggestion: ExplorationSuggestion;
  compact?: boolean;
}) {
  const { idea, reasons } = suggestion;
  const { space, toggleFavorite } = useExploration();
  const saved = space.favorites.some((item) => item.ideaId === idea.id);
  return (
    <article
      className={`exploration-idea-card category-${idea.category}${compact ? " compact" : ""}`}
    >
      <div className="exploration-card-top">
        <span className="exploration-category">
          <ModeIcon mode={idea.category} size={17} />
          {categoryLabels[idea.category]}
        </span>
        <button
          type="button"
          className={`exploration-save${saved ? " saved" : ""}`}
          aria-label={`${saved ? "取消收藏" : "收藏"}：${idea.title}`}
          aria-pressed={saved}
          onClick={() => toggleFavorite(idea.id)}
        >
          <Bookmark
            size={19}
            strokeWidth={1.5}
            fill={saved ? "currentColor" : "none"}
          />
        </button>
      </div>
      <span className="exploration-duration">
        {minutesLabel(idea.minutes)}
        {idea.place ? " · 北京" : ""}
        {idea.discoveredAt ? ` · ${idea.domain ?? "在线发现"}` : ""}
      </span>
      <h3>
        <Link href={`/explore/${idea.id}`}>{idea.title}</Link>
      </h3>
      <p>{idea.description}</p>
      {idea.discoveredAt && idea.source ? (
        <a className="exploration-source-link" href={idea.source.url} target="_blank" rel="noopener noreferrer">
          {idea.source.name} <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      ) : null}
      {!compact ? (
        <div className="exploration-card-why">{reasons[0] ?? idea.why}</div>
      ) : null}
      <Link className="exploration-card-link" href={`/explore/${idea.id}`}>
        看看怎么开始 <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </article>
  );
}
