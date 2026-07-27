describe("inline Place form focus contract", () => {
  it("moves focus into the expanded form and restores the trigger on close", () => {
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
    expect(capture).toContain("inlinePlaceNameRef.current?.focus()");
    expect(capture).toContain("AccessibilityInfo.setAccessibilityFocus(handle)");
    expect(capture).toContain("ref={addPlaceTriggerRef}");
    expect(capture).toContain("ref={nameInputRef}");
  });
});
