describe("minimum touch-target contract", () => {
  const read = (path: string) => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(filePath: string, encoding: "utf8"): string;
    };
    return readFileSync(`${process.cwd()}/${path}`, "utf8");
  };

  it.each([
    ["app/(tabs)/assets.tsx", "filter"],
    ["app/asset-edit.tsx", "inlineLink"],
    ["app/place/[id].tsx", "textAction"],
    ["app/place/[id].tsx", "sectionAction"],
    ["app/capture/index.tsx", "inlineAction"],
    ["app/atlas.tsx", "commandAction"]
  ])("%s keeps %s at least 44 points tall", (path, styleName) => {
    const source = read(path);
    const styleBlock = new RegExp(
      `${styleName}:\\s*\\{[\\s\\S]*?minHeight:\\s*44[,\\n]`
    );
    expect(source).toMatch(styleBlock);
  });
});
