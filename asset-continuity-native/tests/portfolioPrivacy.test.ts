import { portfolioAmountsHiddenFromStorage } from "@/privacy/PortfolioPrivacyProvider";
import {
  formatRecordedValue,
  formatSignedRecordedValue
} from "@/privacy/ValueVisibility";

describe("Portfolio amount privacy", () => {
  it("starts closed when there is no saved preference", () => {
    expect(portfolioAmountsHiddenFromStorage(null)).toBe(true);
  });

  it("stays closed for unknown or explicitly hidden values", () => {
    expect(portfolioAmountsHiddenFromStorage("hidden")).toBe(true);
    expect(portfolioAmountsHiddenFromStorage("legacy-value")).toBe(true);
  });

  it("opens only after the user explicitly selected visible", () => {
    expect(portfolioAmountsHiddenFromStorage("visible")).toBe(false);
  });

  it("uses one hidden format without exposing the amount to assistive text", () => {
    const english = formatRecordedValue({
      amountMinor: 123_450,
      currency: "QAR",
      language: "en",
      visibility: "hidden"
    });
    const arabic = formatRecordedValue({
      amountMinor: 123_450,
      currency: "QAR",
      language: "ar",
      visibility: "hidden"
    });

    expect(english).toEqual({
      text: "QAR \u2022\u2022\u2022\u2022\u2022\u2022",
      accessibilityLabel: "QAR, recorded amount hidden"
    });
    expect(arabic.text).toBe("QAR \u2022\u2022\u2022\u2022\u2022\u2022");
    expect(arabic.accessibilityLabel).toBe(
      "QAR، القيمة المسجّلة مخفية"
    );
    expect(JSON.stringify([english, arabic])).not.toContain("1,234.50");
  });

  it("formats an explicitly revealed amount without changing its truth boundary", () => {
    expect(
      formatRecordedValue({
        amountMinor: 123_450,
        currency: "QAR",
        language: "en",
        visibility: "visible"
      })
    ).toEqual({
      text: "QAR 1,234.50",
      accessibilityLabel: "QAR 1,234.50"
    });
  });

  it("applies the same privacy boundary to negative net position", () => {
    const hiddenEnglish = formatSignedRecordedValue({
      amountMinor: -2_500,
      currency: "QAR",
      language: "en",
      visibility: "hidden"
    });
    const hiddenArabic = formatSignedRecordedValue({
      amountMinor: -2_500,
      currency: "QAR",
      language: "ar",
      visibility: "hidden"
    });

    expect(hiddenEnglish).toEqual({
      text: "QAR \u2022\u2022\u2022\u2022\u2022\u2022",
      accessibilityLabel: "QAR, recorded amount hidden"
    });
    expect(hiddenArabic.text).toBe(
      "QAR \u2022\u2022\u2022\u2022\u2022\u2022"
    );
    expect(hiddenArabic.accessibilityLabel).toMatch(
      /[\u0600-\u06ff]/u
    );
    expect(JSON.stringify([hiddenEnglish, hiddenArabic])).not.toMatch(
      /25|250|2,500/u
    );
  });

  it("keeps a revealed negative sign in visual and assistive output", () => {
    expect(
      formatSignedRecordedValue({
        amountMinor: -2_500,
        currency: "QAR",
        language: "en",
        visibility: "visible"
      })
    ).toEqual({
      text: "QAR −25.00",
      accessibilityLabel: "QAR −25.00"
    });
  });
});
