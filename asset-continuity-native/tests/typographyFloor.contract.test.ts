const auditedFiles = [
  "app/_layout.tsx",
  "app/(auth)/index.tsx",
  "src/auth/components.tsx",
  "src/deviceAuth/DeviceUnlockScreen.tsx",
  "app/(tabs)/_layout.tsx",
  "app/(tabs)/index.tsx",
  "app/(tabs)/vault.tsx",
  "src/components/VaultRecentProof.tsx"
] as const;

const labelStyles = [
  ["app/_layout.tsx", "fontFallbackEyebrow"],
  ["app/(auth)/index.tsx", "eyebrow"],
  ["src/auth/components.tsx", "eyebrow"],
  ["src/auth/components.tsx", "commandEyebrow"],
  ["app/(tabs)/_layout.tsx", "label"],
  ["app/(tabs)/index.tsx", "sampleActivationEyebrow"],
  ["app/(tabs)/index.tsx", "commandLabel"],
  ["app/(tabs)/index.tsx", "portfolioLabel"],
  ["app/(tabs)/vault.tsx", "commandLabel"],
  ["app/(tabs)/vault.tsx", "reminderEyebrow"]
] as const;

const metadataStyles = [
  ["src/auth/components.tsx", "statusEyebrow"],
  ["src/deviceAuth/DeviceUnlockScreen.tsx", "statusText"],
  ["app/(tabs)/vault.tsx", "accountLabel"],
  ["src/components/VaultRecentProof.tsx", "state"]
] as const;

function source(file: string): string {
  const { readFileSync } = jest.requireActual("fs") as {
    readFileSync(path: string, encoding: "utf8"): string;
  };
  return readFileSync(`${process.cwd()}/${file}`, "utf8");
}

function styleBlock(file: string, styleName: string): string {
  const match = source(file).match(
    new RegExp(
      `\\n  ${styleName}: \\{([\\s\\S]*?)\\n  \\}(?:,|\\n)`
    )
  );
  if (!match) {
    throw new Error(`Missing ${styleName} in ${file}`);
  }
  return match[1] ?? "";
}

function fontSize(block: string): number {
  const match = block.match(/fontSize:\s*(\d+(?:\.\d+)?)/);
  if (!match) {
    throw new Error("Style block is missing an explicit fontSize");
  }
  return Number(match[1]);
}

describe("ALYR native typography floor", () => {
  it("keeps every audited visible text style at 12px or larger", () => {
    const undersized = auditedFiles.flatMap((file) =>
      [...source(file).matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)]
        .map((match) => Number(match[1]))
        .filter((size) => size < 12)
        .map((size) => ({ file, size }))
    );

    expect(undersized).toEqual([]);
  });

  it.each(labelStyles)(
    "keeps %s %s at the 13px label floor",
    (file, styleName) => {
      expect(fontSize(styleBlock(file, styleName))).toBeGreaterThanOrEqual(
        13
      );
    }
  );

  it.each(metadataStyles)(
    "reserves the metadata face for compact operational text in %s %s",
    (file, styleName) => {
      const block = styleBlock(file, styleName);

      expect(block).toContain("fontFamily: typography.metadata");
      expect(fontSize(block)).toBeGreaterThanOrEqual(12);
    }
  );
});
