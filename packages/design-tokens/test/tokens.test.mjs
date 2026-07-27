import assert from "node:assert/strict";
import test from "node:test";

import {
  alyrTokens,
  control,
  navigation,
  spacing,
} from "../dist/index.js";

function relativeLuminance(hex) {
  assert.match(hex, /^#[0-9A-F]{6}$/i);
  const channels = [1, 3, 5].map((offset) => {
    const encoded = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return encoded <= 0.04045
      ? encoded / 12.92
      : ((encoded + 0.055) / 1.055) ** 2.4;
  });
  return (
    channels[0] * 0.2126 +
    channels[1] * 0.7152 +
    channels[2] * 0.0722
  );
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function assertMinimumContrast(foreground, background, minimum, label) {
  const ratio = contrastRatio(foreground, background);
  assert.ok(
    ratio >= minimum,
    `${label} must be at least ${minimum}:1; received ${ratio.toFixed(3)}:1`,
  );
}

test("navigation preserves the approved four-destination contract", () => {
  assert.deepEqual(navigation.primaryDestinations, [
    "today",
    "assets",
    "family",
    "vault",
  ]);
  assert.deepEqual(navigation.contextualActions, ["capture", "household"]);
});

test("touch targets and spacing meet mobile foundation constraints", () => {
  assert.ok(control.minimumTouchTarget >= 44);
  assert.equal(spacing[1], 4);
  assert.equal(alyrTokens.colors.dark.canvas, "#0E1012");
});

test("light subtle and warning text pass AA on Paper and White", () => {
  const backgrounds = [
    ["Paper", alyrTokens.palette.paper],
    ["White", alyrTokens.palette.white],
  ];

  for (const [backgroundName, background] of backgrounds) {
    assertMinimumContrast(
      alyrTokens.colors.light.textSubtle,
      background,
      4.5,
      `Subtle text on ${backgroundName}`,
    );
    assertMinimumContrast(
      alyrTokens.colors.semantic.warning,
      background,
      4.5,
      `Warning text on ${backgroundName}`,
    );
  }
});

test("light essential control boundaries pass 3:1 on Paper and White", () => {
  for (const [backgroundName, background] of [
    ["Paper", alyrTokens.palette.paper],
    ["White", alyrTokens.palette.white],
  ]) {
    assertMinimumContrast(
      alyrTokens.colors.light.borderStrong,
      background,
      3,
      `Strong boundary on ${backgroundName}`,
    );
  }
});

test("Concrete remains the approved supporting color for dark surfaces", () => {
  assert.equal(alyrTokens.palette.concrete, "#A7ADB5");
  assert.equal(alyrTokens.colors.dark.textSubtle, alyrTokens.palette.concrete);
});
