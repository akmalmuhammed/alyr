describe("premium product-copy contract", () => {
  it("keeps internal implementation language out of core screens", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const routes = [
      "app/(auth)/confirm-email.tsx",
      "app/(auth)/household.tsx",
      "app/capture/index.tsx",
      "app/asset-value.tsx",
      "app/asset/[id].tsx",
      "app/(tabs)/vault.tsx",
      "app/(tabs)/family.tsx",
      "src/components/PortfolioDashboard/index.tsx"
    ];
    const copy = routes
      .map((path) => readFileSync(`${process.cwd()}/${path}`, "utf8"))
      .join("\n")
      .toLowerCase();

    for (const internalPhrase of [
      "without pretending",
      "private boundary",
      "public pilot",
      "truthful view",
      "user-entered assertion",
      "invitations are not connected yet"
    ]) {
      expect(copy).not.toContain(internalPhrase);
    }
  });
});
