describe("Today Place summary source contract", () => {
  const { readFileSync } = jest.requireActual("fs") as {
    readFileSync(path: string, encoding: "utf8"): string;
  };
  const source = readFileSync(
    `${process.cwd()}/app/(tabs)/index.tsx`,
    "utf8"
  );

  it("uses saved Place facts rather than handcrafted geography", () => {
    expect(source).toContain("selectTodayPlaceOverview");
    expect(source).toContain("todayRegionSummary");
    expect(source).toContain("todayPlaceLocationSummary");
    expect(source).not.toContain("projectAtlasPins");
    expect(source).not.toContain("react-native-svg");
    expect(source).not.toContain("<Path");
    expect(source).not.toContain("<Circle");
  });

  it("keeps the Atlas destination and a visible action", () => {
    expect(source).toContain('router.push("/atlas")');
    expect(source).toContain("copy.today.openAtlas");
    expect(source).toContain('testID="today-atlas-entry"');
  });
});
