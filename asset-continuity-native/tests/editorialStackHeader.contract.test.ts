describe("editorial stack header contract", () => {
  const readSource = (relativePath: string) => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(filePath: string, encoding: "utf8"): string;
    };

    return readFileSync(`${process.cwd()}/${relativePath}`, "utf8");
  };

  it("keeps Portfolio and Atlas back-only headers above their editorial titles", () => {
    const rootLayout = readSource("app/_layout.tsx");

    for (const route of ["dashboard", "atlas"]) {
      expect(rootLayout).toMatch(
        new RegExp(
          `name="${route}"[\\s\\S]*?options=\\{\\{[\\s\\S]*?headerTitle:\\s*\\(\\)\\s*=>\\s*null`
        )
      );
    }
  });

  it("does not apply the window top inset again below a native stack header", () => {
    const dashboard = readSource("app/dashboard.tsx");
    const atlas = readSource("app/atlas.tsx");

    expect(dashboard.match(/safeEdges=\{\[\]\}/g)).toHaveLength(3);
    expect(atlas).toMatch(
      /<AppScreen[\s\S]*?safeEdges=\{\[\]\}[\s\S]*?testID="atlas-screen"/
    );
  });
});
