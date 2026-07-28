import { nativeTokens } from "@alyr/design-tokens";

const fs = jest.requireActual("fs") as {
  readdirSync(path: string, options: { withFileTypes: true }): Array<{
    isDirectory(): boolean;
    isFile(): boolean;
    name: string;
  }>;
};

function visibleTsxFiles(directory: string): string[] {
  return fs
    .readdirSync(`${process.cwd()}/${directory}`, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        return visibleTsxFiles(relativePath);
      }
      return entry.isFile() && entry.name.endsWith(".tsx")
        ? [relativePath]
        : [];
    });
}

const auditedFiles = [...visibleTsxFiles("app"), ...visibleTsxFiles("src")];

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
  ["app/(tabs)/vault.tsx", "reminderEyebrow"],
  ["src/components/ui.tsx", "eyebrow"]
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
  const match = block.match(
    /fontSize:\s*(?:(\d+(?:\.\d+)?)|typeScale\.([A-Za-z0-9_]+))/
  );
  if (!match) {
    throw new Error("Style block is missing an explicit fontSize");
  }
  if (match[1]) return Number(match[1]);
  const token = match[2] as keyof typeof nativeTokens.typography.sizes;
  const value = nativeTokens.typography.sizes[token];
  if (typeof value !== "number") {
    throw new Error(`Unknown typeScale token: ${match[2]}`);
  }
  return value;
}

function declaredFontSizes(file: string): number[] {
  return [
    ...source(file).matchAll(
      /fontSize:\s*(?:(\d+(?:\.\d+)?)|typeScale\.([A-Za-z0-9_]+))/g
    )
  ].map((match) => {
    if (match[1]) return Number(match[1]);
    const token = match[2] as keyof typeof nativeTokens.typography.sizes;
    const value = nativeTokens.typography.sizes[token];
    if (typeof value !== "number") {
      throw new Error(`Unknown typeScale token: ${match[2]} in ${file}`);
    }
    return value;
  });
}

describe("ALYR native typography floor", () => {
  it("keeps every visible native text style at 12px or larger", () => {
    const undersized = auditedFiles.flatMap((file) =>
      declaredFontSizes(file)
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

  it("removes Latin tracking and casing from shared Arabic eyebrows", () => {
    const block = styleBlock("src/components/ui.tsx", "arabicEyebrow");

    expect(block).toContain("letterSpacing: 0");
    expect(block).toContain('textTransform: "none"');
  });
});
