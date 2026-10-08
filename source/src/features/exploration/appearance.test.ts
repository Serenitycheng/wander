import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTone,
  pageTone,
  readableTone,
  colorPresets,
} from "./appearance.ts";
import { createEmptySpace } from "./storage.ts";

test("existing sage and lavender spaces retain their chosen color", () => {
  const preferences = createEmptySpace("serenity").preferences;
  assert.equal(pageTone(preferences, "home"), defaultTone);
  assert.equal(
    pageTone({ ...preferences, theme: "lavender" }, "home"),
    "#80769a",
  );
});

test("a page override stays separate from the space color and other pages", () => {
  const preferences = {
    ...createEmptySpace("serenity").preferences,
    tone: "#80674d",
    pageColors: { home: "#657f91" },
  };
  assert.equal(pageTone(preferences, "home"), "#657f91");
  assert.equal(pageTone(preferences, "explore"), "#80674d");
  assert.equal(pageTone({ ...preferences, pageColors: {} }, "home"), "#80674d");
});

test("white button labels remain readable for light and saturated custom colors", () => {
  for (const tone of [
    ...colorPresets.map((preset) => preset.color),
    "#ffffff",
    "#ffff00",
    "#00ff00",
    "#ff66cc",
    "#000000",
  ]) {
    const rendered = readableTone(tone);
    const channels = rendered
      .slice(1)
      .match(/.{2}/g)!
      .map((hex) => {
        const value = parseInt(hex, 16) / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
    const luminance =
      0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    assert.ok(
      1.05 / (luminance + 0.05) >= 4.5,
      `${tone} produces readable labels`,
    );
  }
});
