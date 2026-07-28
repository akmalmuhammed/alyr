describe("device unlock accessibility and RTL contract", () => {
  it("presents one modal lock surface with large actions and RTL-aware text", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const screen = readFileSync(
      `${process.cwd()}/src/deviceAuth/DeviceUnlockScreen.tsx`,
      "utf8"
    );
    const layout = readFileSync(
      `${process.cwd()}/app/_layout.tsx`,
      "utf8"
    );
    const provider = readFileSync(
      `${process.cwd()}/src/deviceAuth/DeviceAuthProvider.tsx`,
      "utf8"
    );

    expect(screen).toContain("accessibilityViewIsModal");
    expect(screen).toContain('importantForAccessibility="yes"');
    expect(screen).toContain('accessibilityRole="header"');
    expect(screen).toContain("writingDirection: \"rtl\"");
    expect(screen).toContain("minHeight: 48");
    expect(screen).toContain(
      'onboardingHandoffRestoreState === "error"'
    );
    expect(screen).toContain(
      "retryOnboardingHandoffRestore()"
    );
    expect(provider).toContain(
      'onboardingHandoffRestoreState === "ready"'
    );
    expect(layout).toContain(
      "deviceAuth.requiresUnlock && !deviceAuth.vaultReleased"
    );
    expect(layout).toContain("const deviceSubjectReady =");
    expect(layout).toContain(
      'deviceSubjectReady && session?.onboarding === "complete"'
    );
    expect(layout).toContain(
      "pendingFirstRecordIntent"
    );
    expect(layout).toContain(
      'gestureDirection: "horizontal"'
    );
    expect(layout).toContain(
      'Platform.OS === "ios"'
    );
    expect(layout).toContain('"ios_from_left"');
    expect(layout).toContain('"slide_from_left"');
  });
});
