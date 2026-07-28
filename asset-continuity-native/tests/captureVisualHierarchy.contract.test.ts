describe("Quick Passport documentary visual hierarchy", () => {
  const source = (() => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(filePath: string, encoding: "utf8"): string;
    };

    return readFileSync(
      `${process.cwd()}/app/capture/index.tsx`,
      "utf8"
    );
  })();

  it("uses one rule-led choice language instead of repeated bordered cards", () => {
    expect(source).toContain("function RuleChoice({");
    expect(source.match(/<RuleChoice/g)).toHaveLength(5);
    expect(source).not.toContain("ChoiceCard");
    expect(source).not.toContain("choiceCard");

    expect(source).toMatch(
      /choiceRow:\s*\{[\s\S]*?minHeight:\s*56,[\s\S]*?borderBottomWidth:\s*StyleSheet\.hairlineWidth,[\s\S]*?backgroundColor:\s*colors\.transparent/
    );
    expect(source).not.toMatch(
      /choiceRow:\s*\{[^}]*\bborderWidth:/
    );
    expect(source).not.toMatch(
      /choiceRow:\s*\{[^}]*borderRadius:/
    );
    expect(source).toMatch(
      /choiceRowActive:\s*\{[\s\S]*?backgroundColor:\s*colors\.carbon/
    );
    expect(source).toMatch(
      /choiceSignalActive:\s*\{[\s\S]*?backgroundColor:\s*colors\.volt/
    );
    expect(source).toContain(
      '<Check color={colors.volt} size={16} weight="bold" />'
    );
  });

  it("consolidates upload, file and review containers into one documentary frame", () => {
    expect(
      source.match(/styles\.documentaryFrame/g)
    ).toHaveLength(3);
    expect(source).toContain(
      "style={[styles.documentaryFrame, styles.mediaSection]}"
    );
    expect(source).toContain('testID="capture-evidence-frame"');
    expect(source).toContain('testID="capture-review-frame"');
    expect(source).toMatch(
      /documentaryFrame:\s*\{[\s\S]*?borderTopWidth:\s*1,[\s\S]*?borderBottomWidth:\s*1,[\s\S]*?borderColor:\s*colors\.borderStrong/
    );
    expect(source).not.toMatch(
      /documentaryFrame:\s*\{[^}]*borderRadius:/
    );
    expect(source).not.toMatch(
      /documentaryFrame:\s*\{[^}]*backgroundColor:/
    );

    for (const removedSurface of [
      "dropArea",
      "filePanel",
      "reviewPanel",
      "dropIcon",
      "fileIcon",
      "photoIcon"
    ]) {
      expect(source).not.toContain(removedSurface);
    }
  });

  it("keeps library icons bare and uses a restrained Volt evidence signal", () => {
    expect(source).not.toContain("StatusPill");
    expect(source).toContain(
      '<Camera color={colors.text} size={24} weight="regular" />'
    );
    expect(source).toContain(
      '<File color={colors.text} size={25} weight="regular" />'
    );
    expect(source).toContain(
      '<FolderOpen color={colors.text} size={29} weight="regular" />'
    );
    expect(source).toMatch(
      /evidenceStateSignal:\s*\{[\s\S]*?width:\s*3,[\s\S]*?backgroundColor:\s*colors\.volt/
    );
    expect(source).toMatch(
      /evidenceChooseDetail:\s*\{[\s\S]*?fontSize:\s*14,[\s\S]*?lineHeight:\s*20/
    );
    expect(source).not.toMatch(/LinearGradient|BlurView/);
  });

  it("preserves selection, upload and review accessibility contracts", () => {
    expect(source).toContain('accessibilityRole="radio"');
    expect(source).toContain(
      "accessibilityState={{ checked: active }}"
    );
    expect(source).toContain(
      "accessibilityLabel={copy.choosePdf}"
    );
    expect(source).toContain(
      "accessibilityHint={copy.fileLimit}"
    );
    expect(source).toContain('testID="capture-evidence-choose"');
  });
});
