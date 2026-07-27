import {
  assetListAccessibilityLabel,
  atlasGlobeAccessibilityLabel,
  atlasItemCount,
  atlasLocationWork,
  atlasMappedPlaceCount,
  atlasMappedPlaceLabel,
  atlasPositionLabel,
  formatEvidenceDeadline,
  formatRecoveryByteSize,
  getAssetListStateCopy,
  getRecoveryUnavailableCopy,
  getSecondarySurfaceCopy,
  localizedAtlasPinDisclosure,
  localizedRecoveryErrorMessage,
  recoveryConfirmationDescription,
  recoveryReplaceAlertBody,
  shouldStackSecondaryMetadata
} from "@/i18n/secondarySurfaceCopy";
import { RecoveryKitError } from "@/recovery/types";

describe("secondary surface localization", () => {
  it("provides complete English and Arabic contracts for Atlas and Portfolio", () => {
    const english = getSecondarySurfaceCopy("en");
    const arabic = getSecondarySurfaceCopy("ar");

    expect(english.atlas.globe).toBe("Globe");
    expect(arabic.atlas.globe).toBe("الكرة الأرضية");
    expect(arabic.atlas.intro).not.toContain("Place");
    expect(arabic.portfolio.preparing).toBe("جارٍ تجهيز المحفظة");
    expect(arabic.portfolio.continueSetup).not.toBe(
      english.portfolio.continueSetup
    );
  });

  it("uses natural Arabic Atlas counts, navigation and honest pin provenance", () => {
    expect(atlasItemCount(2, "ar")).toBe("غرضان");
    expect(atlasMappedPlaceCount(0, "ar")).toBe(
      "لا توجد أماكن مثبتة"
    );
    expect(atlasMappedPlaceLabel(2, "ar")).toBe("مكانان مثبتان");
    expect(atlasPositionLabel(2, 4, "ar")).toContain("من");
    expect(atlasLocationWork("unpinned", 1, "ar")).toBe(
      "مكان واحد يحتاج إلى دبوس"
    );
    expect(
      localizedAtlasPinDisclosure(
        {
          locationSource: "user_pin",
          precision: "user_placed",
          horizontalAccuracyMeters: 4,
          confirmedAt: "2026-07-27T00:00:00.000Z"
        },
        "ar"
      )
    ).toBe("دبوس موضوع يدويًا · لا توجد دقة GPS مقاسة");
    expect(
      atlasGlobeAccessibilityLabel(
        1,
        1,
        { name: "Bayt بيت", region: "Doha الدوحة" },
        "ar"
      )
    ).toContain("\u2068Bayt بيت\u2069");
  });

  it("localizes Recovery copy, errors, protected identifiers and narrow layout", () => {
    const unavailable = getRecoveryUnavailableCopy(
      "preview-runtime",
      "ar"
    );
    expect(unavailable.title).toContain("ALYR");
    expect(unavailable.description).not.toContain("preview");
    expect(
      localizedRecoveryErrorMessage(
        new RecoveryKitError(
          "AUTHENTICATION_FAILED",
          "internal English detail"
        ),
        "ar"
      )
    ).not.toContain("internal English detail");
    expect(formatRecoveryByteSize(1536, "ar")).toContain("ك.ب.");
    expect(recoveryConfirmationDescription("REPLACE", "ar")).toContain(
      "\u2066REPLACE\u2069"
    );
    expect(recoveryReplaceAlertBody("Bayt بيت", "ar")).toContain(
      "\u2068Bayt بيت\u2069"
    );
    expect(shouldStackSecondaryMetadata(320, 1)).toBe(true);
    expect(shouldStackSecondaryMetadata(390, 1.3)).toBe(true);
    expect(shouldStackSecondaryMetadata(390, 1)).toBe(false);
  });

  it("localizes Asset list state, deadline, location context and VoiceOver label", () => {
    const state = getAssetListStateCopy("needs-location", "ar");
    const deadline = formatEvidenceDeadline(
      "2026-07-31T00:00:00.000Z",
      "ar"
    );
    const voiceOver = assetListAccessibilityLabel(
      "GMT-Master II",
      "ساعة",
      state.accessibilityLabel,
      "منزل الخليج · المكتب",
      "ar"
    );

    expect(state.label).toBe("يحتاج إلى موقع");
    expect(deadline.label).toContain("يستحق");
    expect(deadline.accessibilityLabel).not.toContain("Evidence");
    expect(voiceOver).toContain("\u2068GMT-Master II\u2069");
    expect(voiceOver).toContain("الموقع:");
  });
});
