describe("durable first-record handoff contract", () => {
  const read = (path: string) => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(filePath: string, encoding: "utf8"): string;
    };
    return readFileSync(`${process.cwd()}/${path}`, "utf8");
  };

  it("routes the handoff without acknowledging it at Root", () => {
    const root = read("app/_layout.tsx");
    const effect = root.slice(
      root.indexOf("deliveredFirstRecordHandoffRef.current ="),
      root.indexOf("if (!localeReady)")
    );

    expect(effect).toContain("router.replace(");
    expect(effect).toContain(
      "pendingFirstRecordHandoff.handoffId"
    );
    expect(effect).not.toContain(
      "acknowledgeOnboardingHandoff"
    );
    expect(effect).not.toContain("onboardingHandoffStore.clear");
  });

  it("orders local commit before acknowledgement for both first-record intents", () => {
    const capture = read("app/capture/index.tsx");
    const placeSave = capture.slice(
      capture.indexOf("const savePlaceOnly = async () =>"),
      capture.indexOf("const focusValidationTarget")
    );
    const itemSave = capture.slice(
      capture.indexOf("const saveAsset = async () =>"),
      capture.indexOf("const openPlaceForm")
    );

    expect(placeSave.indexOf("const place = await savePlace()"))
      .toBeLessThan(
        placeSave.indexOf("await finishCommittedCapture(committed)")
      );
    expect(itemSave.indexOf("const asset = await createAsset({"))
      .toBeLessThan(
        itemSave.indexOf("await finishCommittedCapture(committed)")
      );
    expect(capture).toContain(
      "await deviceAuth.acknowledgeOnboardingHandoff({"
    );
    expect(capture).toContain(
      "{ recordId: activeFirstRecordHandoff.recordId }"
    );
  });

  it("keeps empty close deferred in memory and surfaces a retry after ack failure", () => {
    const capture = read("app/capture/index.tsx");
    const removalGuard = capture.slice(
      capture.indexOf('navigation.addListener("beforeRemove"'),
      capture.indexOf("if (!workspace) return null")
    );

    expect(removalGuard).toContain(
      "if (!hasDraft) {\n          deferActiveFirstRecordHandoff();"
    );
    expect(removalGuard).toMatch(
      /deferActiveFirstRecordHandoff\(\);\s+navigation\.dispatch/
    );
    expect(capture).toContain(
      'testID="first-record-handoff-error"'
    );
    expect(capture).toContain('"Confirm setup again"');
    expect(capture).toContain(
      'testID="capture-draft-persistence-error"'
    );
    expect(capture).not.toContain(
      "clearQuickPassportDraft(draftScopeId).catch(() => undefined)"
    );
  });

  it("clears provider memory only after the durable subject record is removed", () => {
    const provider = read(
      "src/deviceAuth/DeviceAuthProvider.tsx"
    );
    const acknowledge = provider.slice(
      provider.indexOf("const acknowledgeOnboardingHandoff"),
      provider.indexOf("const retryCapability")
    );

    expect(
      acknowledge.indexOf("await onboardingHandoffStore.clear(")
    ).toBeLessThan(
      acknowledge.indexOf("setDurableFirstRecordHandoff(")
    );
    expect(acknowledge).toContain(
      'setOnboardingHandoffAcknowledgeState("error")'
    );
  });
});
