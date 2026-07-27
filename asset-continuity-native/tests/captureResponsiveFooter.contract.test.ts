describe("Quick Passport responsive footer", () => {
  it("stacks actions on narrow or accessibility-sized layouts", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/capture/index.tsx`,
      "utf8"
    );

    expect(source).toContain(
      "const stackFooter = width <= 340 || fontScale >= 1.35"
    );
    expect(source).toContain("stackFooter && styles.footerStacked");
    expect(source).toContain('flexDirection: "column"');
    expect(source).toContain('width: "100%"');
  });
});
