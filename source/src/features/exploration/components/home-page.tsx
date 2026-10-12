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
          <h1 id="home-heading">
            今天做点什么？
          </h1>
          <Link
            className="exploration-primary"
            href="/explore?mode=random"
          >
            <Shuffle size={18} aria-hidden="true" />
            随机开始探索
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section
        className="exploration-mode-section"
        aria-labelledby="home-modes"
      >
        <div className="exploration-section-heading">
          <div>
            <h2 id="home-modes">选择探索方向</h2>
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
