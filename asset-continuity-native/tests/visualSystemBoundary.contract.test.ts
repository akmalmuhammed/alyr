const fs = jest.requireActual("fs") as {
  readFileSync(path: string, encoding: "utf8"): string;
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

const visibleFiles = [...visibleTsxFiles("app"), ...visibleTsxFiles("src")];

function source(file: string): string {
  return fs.readFileSync(`${process.cwd()}/${file}`, "utf8");
}

describe("ALYR native visual-system boundary", () => {
  it("keeps component colors behind semantic theme tokens", () => {
    const violations = visibleFiles.flatMap((file) => {
      const text = source(file);
      const literals = [
        ...text.matchAll(
          /(?:color|backgroundColor|borderColor|shadowColor|textShadowColor|tintColor):\s*["'](#[0-9a-f]{3,8}|rgba?\([^"']+\))["']/gi
        )
      ].map((match) => match[0]);
      return literals.map((literal) => ({ file, literal }));
    });

    expect(violations).toEqual([]);
  });

  it("keeps gradients and blur-glass effects out of product screens", () => {
    const violations = visibleFiles.flatMap((file) => {
      const matches = source(file).match(/\b(?:LinearGradient|BlurView)\b/g) ?? [];
      return matches.map((effect) => ({ effect, file }));
    });

    expect(violations).toEqual([]);
  });

  it("uses the icon system instead of emoji glyphs", () => {
    const violations = visibleFiles
      .filter((file) =>
        /[\u{1F300}-\u{1FAFF}]/u.test(source(file))
      )
      .map((file) => ({ file }));

    expect(violations).toEqual([]);
  });
});
