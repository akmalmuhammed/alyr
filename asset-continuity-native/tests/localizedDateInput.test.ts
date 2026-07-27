import {
  datePartsFromIso,
  isoFromLocalizedDateParts,
  normalizeLocaleDigits,
  shouldStackLocalizedDateFields,
  validateLocalizedDateParts
} from "@/i18n/dateInput";

describe("localized calendar-date entry", () => {
  it("accepts Arabic and Persian digits while preserving an ISO value", () => {
    expect(normalizeLocaleDigits("٢٧/۰۷/٢٠٢٦")).toBe("27/07/2026");
    expect(
      isoFromLocalizedDateParts({
        day: "٢٧",
        month: "۰۷",
        year: "٢٠٢٦"
      })
    ).toBe("2026-07-27");
    expect(datePartsFromIso("2026-07-27", "ar")).toEqual({
      day: "٢٧",
      month: "٧",
      year: "٢٠٢٦"
    });
  });

  it("rejects impossible and future dates without changing the draft", () => {
    expect(
      validateLocalizedDateParts(
        { day: "31", month: "02", year: "2026" },
        "2026-07-27"
      )
    ).toBe("invalid");
    expect(
      validateLocalizedDateParts(
        { day: "28", month: "07", year: "2026" },
        "2026-07-27"
      )
    ).toBe("future");
  });

  it("stacks the three fields for narrow or large-text layouts", () => {
    expect(shouldStackLocalizedDateFields(320, 1)).toBe(true);
    expect(shouldStackLocalizedDateFields(390, 1.3)).toBe(true);
    expect(shouldStackLocalizedDateFields(390, 1)).toBe(false);
  });
});
