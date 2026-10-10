"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Shuffle } from "lucide-react";
import { modes } from "../types";
import { useExploration } from "./exploration-app";
import { ModeIcon } from "./idea-card";

export function ExplorationHome() {
  const { owner } = useExploration();
  return (
    <>
      <section className="exploration-home-hero" aria-labelledby="home-heading">
        <div className="exploration-ink-wash" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="exploration-hero-copy">
          <span className="exploration-eyebrow">
            从一点好奇，走出熟悉的日常
          </span>
          <h1 id="home-heading">
            今天，<span>探索一点新鲜的。</span>
          </h1>
          <p>选个方向，或让偶然带路。每次只给几个可立即开始的小建议。</p>
          <Link
            className="exploration-primary"
            href="/explore?mode=random"
          >
            <Shuffle size={18} aria-hidden="true" />
            随机开始探索
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <small>跟着此刻的兴趣，随时可以换个方向。</small>
        </div>
      </section>
      <section
        className="exploration-mode-section"
        aria-labelledby="home-modes"
      >
        <div className="exploration-section-heading">
          <div>
            <h2 id="home-modes">选择探索方向</h2>
            <p>先选场景或体验，进入后可以自由组合。</p>
          </div>
          <Link
            href={`/beijing?space=${owner}`}
            className="exploration-text-link"
          >
            北京去哪儿玩
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="exploration-mode-grid">
          {modes
            .filter((mode) => mode.id !== "random")
            .map((mode) => (
              <Link
                key={mode.id}
                className={`exploration-mode-tile category-${mode.id}`}
                href={`/explore?mode=${mode.id}`}
              >
                <span className="exploration-mode-icon">
                  <ModeIcon mode={mode.id} size={28} />
                </span>
                <strong>{mode.label}</strong>
                <small>{mode.id === "learn" ? "地点随意，接触一点新东西" : mode.id === "create" ? "在家或出门，试一点创作" : mode.note}</small>
                <ArrowUpRight
                  className="exploration-mode-arrow"
                  size={20}
                  aria-hidden="true"
                />
              </Link>
            ))}
        </div>
      </section>
    </>
  );
}
