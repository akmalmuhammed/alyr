import { CAPTURE_COPY } from "@/i18n/captureCopy";

describe("Quick Passport accessibility focus contract", () => {
  const source = (() => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(filePath: string, encoding: "utf8"): string;
    };
    return readFileSync(
      `${process.cwd()}/app/capture/index.tsx`,
      "utf8"
    );
  })();

  it("uses one announcement mechanism per platform for every step change", () => {
    expect(source).toContain("lastFocusedStepRef.current === step");
    expect(source).toContain('if (Platform.OS === "web") {');
    expect(source).toContain(
      "AccessibilityInfo.setAccessibilityFocus(handle)"
    );
    expect(source).toContain(
      'stepAnnouncementRef && Platform.OS === "web"'
    );
    expect(source).not.toContain(
      "AccessibilityInfo.announceForAccessibility(step"
    );
  });

  it("keeps Continue pressable and focuses required targets in task order", () => {
    expect(source).not.toContain("disabled={!continueEnabled}");
    expect(source).toContain("disabled={saving}");
    expect(source).toMatch(
      /if \(missingName\) \{\s*focusValidationTarget\(nameInputRef\);/
    );
    expect(source).toMatch(
      /if \(missingCategory\) \{\s*focusValidationTarget\(categoryGroupRef\);/
    );
    expect(
      source.match(/focusValidationTarget\(locationGroupRef\)/g)
    ).toHaveLength(3);
    expect(source).toContain("accessibilityLabel={copy.category}");
    expect(source).toContain(
      "accessibilityLabel={copy.locationQuestion}"
    );
    expect(CAPTURE_COPY.en.category).toBe("Asset category");
    expect(CAPTURE_COPY.en.locationQuestion).toBe(
      "What you know about the item's location"
    );
  });
});
