describe("focused Place sheet contract", () => {
  it("moves focus into the modal sheet and restores the trigger on close", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const capture = readFileSync(
      `${process.cwd()}/app/capture/index.tsx`,
      "utf8"
    );
    const sharedUi = readFileSync(
      `${process.cwd()}/src/components/ui.tsx`,
      "utf8"
    );

    expect(sharedUi).toContain(
      "export const Field = forwardRef<TextInput, FieldProps>"
    );
    expect(capture).toContain(
      "onShow={() => nameInputRef.current?.focus()}"
    );
    expect(capture).toContain("accessibilityViewIsModal");
    expect(capture).toContain(
      "visible={step === 1 && showPlaceForm}"
    );
    expect(capture).toContain("copy.quickPlaceBody");
    expect(capture).toContain("AccessibilityInfo.setAccessibilityFocus(handle)");
    expect(capture).toContain("ref={addPlaceTriggerRef}");
    expect(capture).toContain("ref={nameInputRef}");
  });

  it("starts capture with the camera and keeps in-flow Place creation minimal", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const capture = readFileSync(
      `${process.cwd()}/app/capture/index.tsx`,
      "utf8"
    );
    const identity = capture.slice(
      capture.indexOf("function IdentityStep"),
      capture.indexOf("function LocationStep")
    );
    const quickPlaceSheet = capture.slice(
      capture.indexOf("function QuickPlaceSheet"),
      capture.indexOf("function EvidenceStep")
    );

    expect(identity.indexOf("styles.mediaSection")).toBeGreaterThan(-1);
    expect(identity.indexOf("styles.mediaSection")).toBeLessThan(
      identity.indexOf("<Field")
    );
    expect(quickPlaceSheet).toContain("<PlacePinEditor");
    expect(quickPlaceSheet).not.toContain(
      "<PlaceClassificationSelector"
    );
    expect(quickPlaceSheet).not.toContain("copy.address");
    expect(quickPlaceSheet).not.toContain("copy.firstSpace");
  });
});
