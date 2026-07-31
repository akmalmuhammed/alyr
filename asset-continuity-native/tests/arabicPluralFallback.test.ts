import {
  formatArabicDisplayNumber,
  selectArabicCardinalPlural
} from "@/i18n/arabicPlural";

describe("Arabic cardinal plural fallback", () => {
  it.each([
    [0, "zero"],
    [1, "one"],
    [2, "two"],
    [3, "few"],
    [10, "few"],
    [11, "many"],
    [99, "many"],
    [100, "other"],
    [-3, "few"],
    [1.5, "other"],
    [Number.POSITIVE_INFINITY, "other"]
  ] as const)("selects %s as %s", (value, category) => {
    expect(selectArabicCardinalPlural(value)).toBe(category);
  });

  it("formats Arabic UI counts without Intl.NumberFormat", () => {
    expect(formatArabicDisplayNumber(0, 0)).toBe("٠");
    expect(formatArabicDisplayNumber(12, 0)).toBe("١٢");
    expect(formatArabicDisplayNumber(12.5)).toBe("١٢٫٥");
  });

  it("loads every Arabic copy surface without Intl plural and number constructors", () => {
    const pluralRules = Object.getOwnPropertyDescriptor(Intl, "PluralRules");
    const numberFormat = Object.getOwnPropertyDescriptor(Intl, "NumberFormat");

    try {
      Object.defineProperty(Intl, "PluralRules", {
        configurable: true,
        value: undefined
      });
      Object.defineProperty(Intl, "NumberFormat", {
        configurable: true,
        value: undefined
      });

      jest.isolateModules(() => {
        const portfolio = jest.requireActual(
          "@/i18n/portfolioCopy"
        ) as typeof import("@/i18n/portfolioCopy");
        const secondary = jest.requireActual(
          "@/i18n/secondarySurfaceCopy"
        ) as typeof import("@/i18n/secondarySurfaceCopy");

        expect(
          portfolio.getPortfolioExperienceCopy("ar").netPosition.moreCurrencies(3)
        ).toContain("٣");
        expect(
          portfolio.getPortfolioExperienceCopy("ar").liabilities.viewAll(3)
        ).toContain("٣");
        expect(secondary.atlasItemCount(3, "ar")).toContain("٣");
        expect(secondary.atlasPlaceCount(11, "ar")).toContain("١١");
      });
    } finally {
      if (pluralRules) {
        Object.defineProperty(Intl, "PluralRules", pluralRules);
      } else {
        Reflect.deleteProperty(Intl, "PluralRules");
      }
      if (numberFormat) {
        Object.defineProperty(Intl, "NumberFormat", numberFormat);
      } else {
        Reflect.deleteProperty(Intl, "NumberFormat");
      }
    }
  });
});
