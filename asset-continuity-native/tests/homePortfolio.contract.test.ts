import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";
import { getPortfolioExperienceCopy } from "@/i18n/portfolioCopy";

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
    expect(source).toContain(
      "{promoteSyncTruth ? syncTruth : null}"
    );
    expect(source).toContain(
      "{!promoteSyncTruth ? syncTruth : null}"
    );
    expect(
      source.indexOf("{promoteSyncTruth ? syncTruth : null}")
    ).toBeLessThan(source.indexOf("<CommandSurface>"));
    expect(
      source.indexOf("{!promoteSyncTruth ? syncTruth : null}")
    ).toBeGreaterThan(source.indexOf("</CommandSurface>"));
    expect(source).not.toContain("compactPriority");
    expect(source).toContain('variant="command"');
    expect(source).toContain("borderTopWidth: 1");
    expect(source).toContain("borderBottomWidth: 1");
  });

  it("keeps every Today financial amount masked and delegates reveal to the dashboard", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/index.tsx`,
      "utf8"
    );

    expect(source).toContain(
      "const valueVisibility = valueVisibilityFromHidden(true);"
    );
    expect(source).not.toContain("usePortfolioPrivacy");
    expect(source).toMatch(
      /formatSignedRecordedValue\(\{[\s\S]*?visibility:\s*valueVisibility[\s\S]*?\}\)/u
    );
    expect(source).toMatch(
      /formatRecordedValue\(\{[\s\S]*?visibility:\s*valueVisibility[\s\S]*?\}\)/u
    );
    expect(source).toContain('router.push("/dashboard")');
    expect(source).toContain("moreCurrencyLabel");
    expect(source).toMatch(
      /accessibilityLabel:\s*\[[\s\S]*?moreCurrencyLabel[\s\S]*?\]/u
    );
  });

  it("promotes sample activation on Today without merging sample records", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/index.tsx`,
      "utf8"
    );

    expect(source).toContain("sampleActivationDestination");
    expect(source).toContain('testID="today-sample-activation"');
    expect(source).toContain(
      "copy.vault.createMyPrivateHousehold"
    );
    expect(source).toContain(
      "router.push(sampleActivationRoute)"
    );
    expect(CORE_JOURNEY_COPY.en.today.sampleNextBody).toContain(
      "Sample entries stay out"
    );
  });

  it("uses Arabic plural forms for hidden currency counts", () => {
    const copy = getPortfolioExperienceCopy("ar");

    expect(copy.netPosition.moreCurrencies(1)).toBe(
      "+عملة إضافية"
    );
    expect(copy.netPosition.moreCurrencies(2)).toBe(
      "+عملتان إضافيتان"
    );
    expect(copy.netPosition.moreCurrencies(3)).toContain(
      "عملات إضافية"
    );
    expect(copy.netPosition.moreCurrencies(11)).toContain(
      "عملة إضافية"
    );
  });
});
