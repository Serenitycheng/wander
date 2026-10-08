"use client";

import { Check, Palette, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { colorPresets, defaultTone, isTone, pageNames } from "../appearance";
import type { ExplorationPage } from "../types";
import { useExploration } from "./exploration-app";

export function ToneOptions({
  color,
  choose,
  label,
}: {
  color: string;
  choose: (color: string) => void;
  label: string;
}) {
  return (
    <fieldset className="exploration-tone-options" aria-label={label}>
      {colorPresets.map((tone) => (
        <button
          key={tone.color}
          type="button"
          style={{ "--swatch": tone.color } as CSSProperties}
          aria-label={tone.name}
          aria-pressed={color.toLowerCase() === tone.color}
          onClick={() => choose(tone.color)}
        >
          <span className="exploration-tone-swatch">
            {color.toLowerCase() === tone.color ? (
              <Check size={14} aria-hidden="true" />
            ) : null}
          </span>
          <span>{tone.name}</span>
        </button>
      ))}
    </fieldset>
  );
}

function CustomTone({
  color,
  choose,
}: {
  color: string;
  choose: (color: string) => void;
}) {
  const [edit, setEdit] = useState({ color, draft: color, error: "" });
  // Keep the native color input mounted while updating the surrounding palette.
  if (edit.color !== color) setEdit({ color, draft: color, error: "" });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!isTone(edit.draft.trim())) {
      setEdit({ ...edit, error: "请输入完整色值，例如 #657f91。" });
      return;
    }
    const nextColor = edit.draft.trim().toLowerCase();
    choose(nextColor);
    setEdit({ color: nextColor, draft: nextColor, error: "" });
  };
  return (
    <form className="exploration-custom-tone" onSubmit={submit}>
      <span>自定义颜色</span>
      <div className="exploration-custom-tone-row">
        <input
          type="color"
          aria-label="自定义页面颜色"
          value={color}
          onChange={(event) => {
            choose(event.target.value);
            setEdit({
              color: event.target.value,
              draft: event.target.value,
              error: "",
            });
          }}
        />
        <input
          aria-label="颜色色值"
          value={edit.draft}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            setEdit({ color, draft: event.target.value, error: "" });
          }}
        />
        <button type="submit">应用</button>
      </div>
      {edit.error ? <p role="alert">{edit.error}</p> : null}
    </form>
  );
}

export function PageColorPicker({
  page,
  color,
  choose,
  reset,
  custom,
}: {
  page: ExplorationPage;
  color: string;
  choose: (color: string) => void;
  reset: () => void;
  custom: boolean;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        details.current?.open &&
        event.target instanceof Node &&
        !details.current.contains(event.target)
      )
        details.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.current?.open) {
        details.current.open = false;
        details.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className="exploration-color-picker" ref={details}>
      <summary aria-label="调整页面颜色">
        <Palette size={18} strokeWidth={1.6} aria-hidden="true" />
        <span>页面颜色</span>
      </summary>
      <div
        className="exploration-color-panel"
        role="region"
        aria-label="页面颜色设置"
      >
        <div className="exploration-color-panel-heading">
          <strong>给{pageNames[page]}换个颜色</strong>
          <span
            className="exploration-color-current"
            style={{ background: color }}
          />
        </div>
        <p>只调整当前页面，会自动记住。</p>
        <ToneOptions color={color} choose={choose} label="预设页面颜色" />
        <CustomTone color={color} choose={choose} />
        <button
          type="button"
          className="exploration-color-reset"
          disabled={!custom}
          onClick={reset}
        >
          <RotateCcw size={13} />
          跟随空间配色
        </button>
      </div>
    </details>
  );
}

export function AppearanceSettings() {
  const { space, update } = useExploration();
  const color =
    space.preferences.tone ??
    (space.preferences.theme === "lavender" ? "#80769a" : defaultTone);
  const choose = (tone: string) => {
    update((value) => ({
      ...value,
      preferences: { ...value.preferences, tone },
    }));
  };
  return (
    <section className="exploration-setting exploration-appearance-setting">
      <div>
        <h2>给空间选个底色</h2>
        <p>每个页面也可以有自己的颜色，右上角随时调整。</p>
      </div>
      <div className="exploration-appearance-controls">
        <ToneOptions color={color} choose={choose} label="空间预设颜色" />
        <CustomTone color={color} choose={choose} />
        <button
          type="button"
          className="exploration-color-reset"
          onClick={() =>
            update((value) => {
              const preferences = { ...value.preferences };
              delete preferences.tone;
              delete preferences.pageColors;
              return {
                ...value,
                preferences: { ...preferences, theme: "sage" },
              };
            })
          }
        >
          <RotateCcw size={13} />
          恢复默认配色
        </button>
      </div>
    </section>
  );
}
