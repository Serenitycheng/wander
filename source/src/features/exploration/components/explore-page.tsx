"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { modes, moodOptions, timeOptions } from "../types";
import type { ExplorationFilters, ExplorationMode } from "../types";
import { useExploration } from "./exploration-app";
import { IdeaCard, ModeIcon } from "./idea-card";

export function ExplorePage({
  initialMode,
  autoStart = false,
}: {
  initialMode?: ExplorationMode;
  autoStart?: boolean;
}) {
  const { space, owner, suggestions, generate, generating, discoveryNote, discoveryNeedsLogin, reauthenticate } = useExploration();
  const [filters, setFilters] = useState<ExplorationFilters>(() => ({
    ...space.preferences,
    mode: initialMode ?? space.preferences.mode,
  }));
  const autoStarted = useRef(false);
  const [generatedFilters, setGeneratedFilters] = useState<ExplorationFilters>(
    space.preferences,
  );
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    const timer = window.setTimeout(() => {
      autoStarted.current = true;
      generate(filters);
      setGeneratedFilters(filters);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, filters, generate]);
  const changed =
    suggestions.length > 0 &&
    (filters.mode !== generatedFilters.mode ||
      filters.time !== generatedFilters.time ||
      filters.mood !== generatedFilters.mood);
  const explore = () => {
    generate(filters);
    setGeneratedFilters(filters);
  };
  return (
    <div className="exploration-page">
      <header className="exploration-page-heading">
        <span className="exploration-eyebrow">跟着一点好奇心</span>
        <h1>把好奇心，交给这一刻。</h1>
        <p>选一个方向，剩下的让新的可能慢慢出现。</p>
      </header>
      <div className="exploration-workbench">
        <section className="exploration-controls" aria-label="探索条件">
          <fieldset>
            <legend>你现在想怎么探索？</legend>
            <div className="exploration-mode-choices">
              {modes.map((mode) => (
                <button
                  className={`exploration-mode-choice category-${mode.id}${filters.mode === mode.id ? " selected" : ""}`}
                  key={mode.id}
                  type="button"
                  aria-pressed={filters.mode === mode.id}
                  onClick={() =>
                    setFilters((value) => ({ ...value, mode: mode.id }))
                  }
                >
                  <ModeIcon mode={mode.id} />
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="exploration-condition-grid">
            <fieldset>
              <legend>大概留多少时间？</legend>
              <div className="exploration-choice-row">
                {timeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={filters.time === option.id ? "selected" : ""}
                    aria-pressed={filters.time === option.id}
                    onClick={() =>
                      setFilters((value) => ({ ...value, time: option.id }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>此刻是什么状态？</legend>
              <div className="exploration-choice-row">
                {moodOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={filters.mood === option.id ? "selected" : ""}
                    aria-pressed={filters.mood === option.id}
                    onClick={() =>
                      setFilters((value) => ({ ...value, mood: option.id }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="exploration-generate-row">
            <button
              type="button"
              className="exploration-primary"
              onClick={explore}
            >
              {generating ? (
                <><LoaderCircle size={17} className="exploration-loading-icon" aria-hidden="true" />再换一组</>
              ) : suggestions.length && !changed ? (
                <>
                  <RefreshCw size={17} />
                  换一组新的可能
                </>
              ) : (
                <>
                  给我一点灵感 <ArrowRight size={17} />
                </>
              )}
            </button>
            <span>每次 3 个选择，挑一个感兴趣的。</span>
          </div>
        </section>
        <section
          className="exploration-results"
          aria-label="探索建议"
          aria-live="polite"
          aria-busy={generating && !suggestions.length}
        >
          {discoveryNote ? <div className="exploration-discovery-note" role="status">
            <span>{discoveryNote}</span>
            {discoveryNeedsLogin ? <button type="button" className="exploration-secondary" onClick={reauthenticate}>重新登录</button> : null}
          </div> : null}
          {suggestions.length ? (
            <>
              <div className="exploration-section-heading">
                <div>
                  <span className="exploration-eyebrow">也许，试试这些</span>
                  <h2>
                    {changed
                      ? "想换方向？重新给我一点灵感。"
                      : "从一个让你好奇的开始。"}
                  </h2>
                </div>
                <span className="exploration-soft-note">
                  时长只是活动参考，不含往返路程
                </span>
              </div>
              <div className="exploration-card-grid" data-count={suggestions.length}>
                {suggestions.map((suggestion) => (
                  <IdeaCard key={suggestion.idea.id} suggestion={suggestion} />
                ))}
              </div>
            </>
          ) : (
            <div className="exploration-before-start">
              <Sparkles size={25} strokeWidth={1.2} />
              <p>
                {generating ? "看看别的领域里，有什么值得一试。" : "不用回答很多问题。"}
                <br />
                {generating ? "找到后，会放在这里。" : "点一下，让新的可能自己出现。"}
              </p>
            </div>
          )}
        </section>
      </div>
      <div className="exploration-city-entry">
        <span>
          <ModeIcon mode="outside" size={20} />
          想在北京约朋友出门？
        </span>
        <Link
          href={`/beijing?space=${owner}`}
          className="exploration-text-link"
        >
          打开北京去哪儿玩 <ArrowUpRight size={16} />
        </Link>
      </div>
    </div>
  );
}
