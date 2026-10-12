"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { moodOptions, timeOptions } from "../types";
import type { ExplorationFilters, ExplorationMode } from "../types";
import { useExploration } from "./exploration-app";
import { IdeaCard, ModeIcon } from "./idea-card";
import { intents, intentFor, settings, settingFor, withExplorationAxes } from "../exploration-filters";

export function ExplorePage({
  initialMode,
  autoStart = false,
}: {
  initialMode?: ExplorationMode;
  autoStart?: boolean;
}) {
  const { space, owner, status, suggestions, generate, prepare, generating, discoveryNote, discoveryProgress, discoveryNeedsLogin, discoveryFailed, reauthenticate } = useExploration();
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
  useEffect(() => {
    if (status === "loading") return;
    const timer = window.setTimeout(() => prepare(filters), 300);
    return () => window.clearTimeout(timer);
  }, [filters, status, prepare]);
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
        <h1>探索</h1>
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
              {discoveryFailed && !generating && !changed ? (
                <><RefreshCw size={17} />再试一次</>
              ) : suggestions.length && !changed ? (
                <>
                  <RefreshCw size={17} />
                  换一组
                </>
              ) : (
                <>
                  查找推荐 <ArrowRight size={17} />
                </>
              )}
            </button>
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
                  <h2>{changed ? "条件已修改" : "推荐"}</h2>
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
                {generating ? "正在查找…" : discoveryFailed ? "推荐未完成，请重试。" : "暂无推荐"}
              </p>
            </div>
          )}
        </section>
      </div>
      <div className="exploration-city-entry">
        <span>
          <ModeIcon mode="outside" size={20} />
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
