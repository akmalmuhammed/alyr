import { describe, expect, it } from "vitest";
import { getGlobeScale } from "../src/Globe.jsx";

describe("responsive globe composition", () => {
  it("fills a desktop stage without exceeding the intended scale cap", () => {
    expect(getGlobeScale(540, 500)).toBeCloseTo(1.125, 3);
    expect(getGlobeScale(900, 560)).toBeCloseTo(1.125, 3);
  });

  it("fits a narrow mobile stage without clipping the orb sides", () => {
    expect(getGlobeScale(350, 470)).toBeCloseTo(0.875, 3);
    expect(getGlobeScale(390, 500)).toBeCloseTo(0.9165, 4);
  });

  it("keeps degenerate measurements safe during first layout", () => {
    expect(getGlobeScale(0, 0)).toBeCloseTo(1.125, 3);
    expect(Number.isFinite(getGlobeScale(undefined, undefined))).toBe(true);
  });
});
