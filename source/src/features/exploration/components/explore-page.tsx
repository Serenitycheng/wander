"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { moodOptions, timeOptions } from "../types";
import type { ExplorationFilters, ExplorationMode } from "../types";
import { useExploration } from "./exploration-app";
import { IdeaCard, ModeIcon } from "./idea-card";
import { outingAreaFor, shortLocalOuting } from "../outing-policy";
import { intents, intentFor, settings, settingFor, withExplorationAxes } from "../exploration-filters";

export function ExplorePage({
  initialMode,
  autoStart = false,
}: {
  initialMode?: ExplorationMode;
  autoStart?: boolean;
}) {
  const { space, owner, status, suggestions, generate, generating, discoveryNote, discoveryProgress, discoveryNeedsLogin, reauthenticate } = useExploration();
  const initialFilters = () => withExplorationAxes(space.preferences,
    initialMode ? settingFor({ ...space.preferences, setting: undefined, mode: initialMode }) : settingFor(space.preferences),
    initialMode ? intentFor({ ...space.preferences, intent: undefined, mode: initialMode }) : intentFor(space.preferences));
  const [filters, setFilters] = useState<ExplorationFilters>(initialFilters);
  const autoStarted = useRef(false);
  const [generatedFilters, setGeneratedFilters] = useState<ExplorationFilters>(
    space.preferences,
  );
  useEffect(() => {
    if (status === "loading" || autoStarted.current) return;
    const next = withExplorationAxes(space.preferences,
      initialMode ? settingFor({ ...space.preferences, setting: undefined, mode: initialMode }) : settingFor(space.preferences),
      initialMode ? intentFor({ ...space.preferences, intent: undefined, mode: initialMode }) : intentFor(space.preferences));
    const timer = window.setTimeout(() => {
      autoStarted.current = true;
      setFilters(next);
      if (autoStart) generate(next);
      setGeneratedFilters(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, initialMode, status, space.preferences, generate]);
  const changed =
    suggestions.length > 0 &&
    (settingFor(filters) !== settingFor(generatedFilters) || intentFor(filters) !== intentFor(generatedFilters) ||
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
            <legend>这次想在哪里？</legend>
            <div className="exploration-mode-choices">
              {settings.map((setting) => (
                <button
                  className={`exploration-mode-choice category-${setting.id === "any" ? "random" : setting.id}${settingFor(filters) === setting.id ? " selected" : ""}`}
                  key={setting.id}
                  type="button"
                  aria-pressed={settingFor(filters) === setting.id}
                  onClick={() =>
                    setFilters((value) => withExplorationAxes(value, setting.id))
                  }
                >
                  <ModeIcon mode={setting.id === "any" ? "random" : setting.id} />
                  <span>{setting.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="exploration-intent-choices">
            <legend>想尝试什么？</legend>
            <div className="exploration-choice-row">
              {intents.map((intent) => <button type="button" key={intent.id}
                className={intentFor(filters) === intent.id ? "selected" : ""}
                aria-pressed={intentFor(filters) === intent.id}
                onClick={() => setFilters((value) => withExplorationAxes(value, settingFor(value), intent.id))}>
                {intent.label}
              </button>)}
            </div>
            <p className="exploration-soft-note">可以和场景组合，也可以随便探索。</p>
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
              {owner === "serenity" && settingFor(filters) !== "home" ? <p className="exploration-soft-note">
                {shortLocalOuting(filters, outingAreaFor(owner))
                  ? "出门只看良乡阳光邑上附近，逛店、买点吃的也可以。"
                  : "北京全城都可以，国博、国图等较远的地方也保留。"}
              </p> : null}
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
              {suggestions.length && !changed ? (
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
          </div> : null}
          {discoveryProgress ? <div className="exploration-discovery-note exploration-discovery-progress" role="status">
            {generating ? <LoaderCircle size={14} className="exploration-loading-icon" aria-hidden="true" /> : null}
            <span>{discoveryProgress}</span>
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
                  <IdeaCard key={suggestion.idea.id} suggestion={suggestion} feedback />
                ))}
              </div>
            </>
          ) : (
            <div className="exploration-before-start">
              <Sparkles size={25} strokeWidth={1.2} />
              <p>
                {generating ? "正在找三个新的选择。" : space.recommendationCleanup?.active ? "当前没有更多匹配的新内容。" : "不用回答很多问题。"}
                <br />
                {generating ? "找到后，会放在这里。" : space.recommendationCleanup?.active ? "可以继续发现，旧推荐不会拿来补位。" : "点一下，让新的可能自己出现。"}
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
