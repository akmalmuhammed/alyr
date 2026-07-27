import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";

describe("Today portfolio entry point", () => {
  it("shows recorded totals and links to the complete dashboard", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/index.tsx`,
      "utf8"
    );

    expect(source).toContain("buildPortfolioSnapshot");
    expect(source).toContain("portfolio.currencyTotals");
    expect(source).toContain("copy.today.currenciesSeparate");
    expect(CORE_JOURNEY_COPY.en.today.currenciesSeparate).toBe(
      "currencies stay separate"
    );
    expect(source).toContain('router.push("/dashboard")');
    expect(source).toContain("portfolioAccessibilityLabel");
    expect(source.indexOf("<CommandSurface>")).toBeLessThan(
      source.indexOf("<TodayPortfolioCard")
    );
    expect(source).not.toContain("compactPriority");
    expect(source).toContain('variant="command"');
    expect(source).toContain("borderTopWidth: 1");
    expect(source).toContain("borderBottomWidth: 1");
  });
});
