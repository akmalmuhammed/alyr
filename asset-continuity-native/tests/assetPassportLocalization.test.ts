import {
  ASSET_PASSPORT_COPY,
  getAssetPassportCopy,
  isolateAssetPassportIdentifier
} from "../app/asset/[id]";

function leafKeys(value: object): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) =>
      typeof child === "object" && child !== null
        ? leafKeys(child as object).map((nested) => `${key}.${nested}`)
        : [key]
    )
    .sort();
}

describe("Asset Passport localization", () => {
  it("keeps the English and Arabic surface contracts in parity", () => {
    expect(leafKeys(ASSET_PASSPORT_COPY.ar)).toEqual(
      leafKeys(ASSET_PASSPORT_COPY.en)
    );
    expect(getAssetPassportCopy("en").savedTitle).toBe(
      "Passport saved"
    );
    expect(getAssetPassportCopy("ar").savedTitle).toBe(
      "تم حفظ الجواز"
    );
    expect(getAssetPassportCopy("ar").retrievalPath).toBe(
      "مسار الاسترجاع"
    );
    expect(getAssetPassportCopy("ar").evidenceTitle).toBe(
      "الإثباتات والمستندات"
    );
  });

  it("isolates mixed-script user identifiers only inside Arabic copy", () => {
    const identifier = "GMT Master II #126.pdf";
    const protectedIdentifier = isolateAssetPassportIdentifier(
      identifier,
      "ar"
    );

    expect(protectedIdentifier).toBe(`\u2068${identifier}\u2069`);
    expect(isolateAssetPassportIdentifier(identifier, "en")).toBe(
      identifier
    );
    expect(
      getAssetPassportCopy("ar").primaryPhoto(protectedIdentifier)
    ).toContain(`\u2068${identifier}\u2069`);
    expect(
      getAssetPassportCopy("ar").openPlace(
        isolateAssetPassportIdentifier("West Bay Home", "ar")
      )
    ).toBe("فتح \u2068West Bay Home\u2069");
  });

  it("keeps Arabic status, lifecycle and evidence actions out of English", () => {
    const arabic = getAssetPassportCopy("ar");

    expect(arabic.archived).toBe("مؤرشف");
    expect(arabic.archiveAction).toBe("أرشفة الجواز");
    expect(arabic.waitingForReview).toBe("بانتظار مراجعتك");
    expect(arabic.storageQueued).toBe("في قائمة الانتظار");
    expect(JSON.stringify(arabic)).not.toContain("Waiting for your review");
  });
});
