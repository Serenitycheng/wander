import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTone,
  spaceTone,
  readableTone,
  colorPresets,
} from "./appearance.ts";
import { createEmptySpace } from "./storage.ts";

test("existing sage and lavender spaces retain their chosen color", () => {
  const preferences = createEmptySpace("serenity").preferences;
  assert.equal(spaceTone(preferences), defaultTone);
  assert.equal(
    spaceTone({ ...preferences, theme: "lavender" }),
    "#80769a",
  );
});

test("legacy page colors provide one stable fallback and never override a shared tone", () => {
  const preferences = {
    ...createEmptySpace("serenity").preferences,
    tone: "#80674d",
    pageColors: { home: "#657f91", records: "#8a6f7d" },
  };
  assert.equal(spaceTone(preferences), "#80674d");
  const legacy = { ...createEmptySpace("serenity").preferences, pageColors: preferences.pageColors };
  assert.equal(spaceTone(legacy), "#657f91");
  assert.deepEqual(legacy.pageColors, { home: "#657f91", records: "#8a6f7d" });
  assert.equal(spaceTone({ ...legacy, pageColors: {} }), defaultTone);
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
