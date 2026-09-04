// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PortfolioValueSummary, {
  formatPortfolioAmount,
} from "../src/PortfolioValueSummary.jsx";

function makeSummary(overrides = {}) {
  return {
    basis: "user-supplied",
    scope: "active-assets-only",
    activeAssetCount: 0,
    valuedAssetCount: 0,
    unvaluedAssetCount: 0,
    currencyTotals: [],
    currencyConversionApplied: false,
    includesLiabilities: false,
    ...overrides,
  };
}

afterEach(cleanup);

describe("PortfolioValueSummary", () => {
  it("renders a truthful empty state when there are no active assets", () => {
    render(<PortfolioValueSummary summary={makeSummary()} />);

    const section = screen.getByRole("region", {
      name: "Known asset value",
    });
    expect(
      within(section).getByText("No active assets yet").textContent,
    ).toBe("No active assets yet");
    expect(
      within(section).getByText("0 active assets").textContent,
    ).toBe("0 active assets");
    expect(within(section).getByText("Valued").nextElementSibling?.textContent).toBe(
      "0",
    );
    expect(section.textContent).toContain(
      "User supplied · no currency conversion",
    );
  });

  it("distinguishes unvalued assets from a zero-valued portfolio", () => {
    render(
      <PortfolioValueSummary
        summary={makeSummary({
          activeAssetCount: 3,
          unvaluedAssetCount: 3,
        })}
      />,
    );

    const section = screen.getByRole("region", {
      name: "Known asset value",
    });
    expect(within(section).getByText("No values recorded yet").textContent).toBe(
      "No values recorded yet",
    );
    expect(
      within(section).getByText("Value not recorded").nextElementSibling
        ?.textContent,
    ).toBe("3");
    expect(
      within(section).queryByRole("list", {
        name: "Recorded currency totals",
      }),
    ).toBeNull();
  });

  it("renders one currency total, including a recorded zero", () => {
    render(
      <PortfolioValueSummary
        summary={makeSummary({
          activeAssetCount: 1,
          valuedAssetCount: 1,
          currencyTotals: [
            { currency: "QAR", amountMinor: 0, assetCount: 1 },
          ],
        })}
      />,
    );

    const totals = screen.getByRole("list", {
      name: "Recorded currency totals",
    });
    expect(within(totals).getByText("QAR").textContent).toBe("QAR");
    expect(within(totals).getByText("0").textContent).toBe("0");
    expect(within(totals).getByText("1 valued asset").textContent).toBe(
      "1 valued asset",
    );
    expect(screen.queryByText("No values recorded yet")).toBeNull();
  });

  it("keeps multiple currencies in separate rows without inventing a total", () => {
    render(
      <PortfolioValueSummary
        summary={makeSummary({
          activeAssetCount: 4,
          valuedAssetCount: 3,
          unvaluedAssetCount: 1,
          currencyTotals: [
            { currency: "AED", amountMinor: 60_000, assetCount: 1 },
            { currency: "QAR", amountMinor: 350_050, assetCount: 2 },
          ],
        })}
      />,
    );

    const rows = within(
      screen.getByRole("list", { name: "Recorded currency totals" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("AED").textContent).toBe("AED");
    expect(within(rows[0]).getByText("600").textContent).toBe("600");
    expect(within(rows[1]).getByText("QAR").textContent).toBe("QAR");
    expect(within(rows[1]).getByText("3,500.50").textContent).toBe("3,500.50");
    expect(rows[1].textContent).toContain("2 valued assets");
    expect(screen.getByText("Known asset value").textContent).toBe(
      "Known asset value",
    );
    expect(document.body.textContent?.toLowerCase()).not.toContain("net worth");
  });

  it("labels an overflowing currency bucket as unavailable", () => {
    render(
      <PortfolioValueSummary
        summary={makeSummary({
          activeAssetCount: 3,
          valuedAssetCount: 3,
          currencyTotals: [
            { currency: "QAR", amountMinor: null, assetCount: 3 },
          ],
        })}
      />,
    );

    expect(screen.getByText("Total unavailable").textContent).toBe(
      "Total unavailable",
    );
    expect(
      screen.getByText(
        "Recorded values exceed the supported total range.",
      ).textContent,
    ).toBe("Recorded values exceed the supported total range.");
  });
});

describe("formatPortfolioAmount", () => {
  it("formats safe minor-unit values deterministically without conversion", () => {
    expect(formatPortfolioAmount("QAR", 123_456)).toBe("QAR 1,234.56");
    expect(formatPortfolioAmount("USD", 50_000)).toBe("USD 500");
    expect(formatPortfolioAmount("AED", 1)).toBe("AED 0.01");
  });

  it("leaves invalid or uncalculable amounts unavailable", () => {
    expect(formatPortfolioAmount("QAR", null)).toBeNull();
    expect(formatPortfolioAmount("QAR", -1)).toBeNull();
    expect(formatPortfolioAmount("QAR", Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(formatPortfolioAmount("qar", 100)).toBeNull();
  });
});
