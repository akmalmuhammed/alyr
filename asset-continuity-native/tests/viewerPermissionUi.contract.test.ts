const { readFileSync } = jest.requireActual("fs") as {
  readFileSync(path: string, encoding: "utf8"): string;
};

function source(path: string): string {
  return readFileSync(`${process.cwd()}/${path}`, "utf8");
}

describe("viewer permission UI contract", () => {
  it.each([
    ["app/capture/index.tsx", "asset.write"],
    ["app/asset-edit.tsx", "asset.write"],
    ["app/asset-value.tsx", "asset.write"],
    ["app/place-edit.tsx", "place.write"],
    ["app/place-pin.tsx", "place.write"],
    ["app/space-edit.tsx", "place.write"],
    ["app/export-create.tsx", "export.create"],
    ["app/recovery-create.tsx", "export.create"],
    ["app/recovery-import.tsx", "household.manage"]
  ])("guards direct mutation route %s with %s", (path, capability) => {
    const route = source(path);
    expect(route).toContain("PermissionDeniedScreen");
    expect(route).toContain("can(");
    expect(route).toContain(`"${capability}"`);
  });

  it.each([
    "app/(tabs)/index.tsx",
    "app/(tabs)/assets.tsx",
    "app/(tabs)/vault.tsx",
    "app/asset/[id].tsx",
    "app/place/[id].tsx",
    "app/evidence/[id].tsx",
    "app/atlas.tsx",
    "app/dashboard.tsx"
  ])("shows a consequence and gates write CTAs on %s", (path) => {
    const screen = source(path);
    expect(screen).toContain("PermissionNotice");
    expect(screen).toMatch(/\bcan\("(?:asset|place|evidence|export)\.(?:write|create)"\)/u);
  });

  it("enforces capabilities before every durable workspace mutation", () => {
    const provider = source("src/state/WorkspaceProvider.tsx");
    for (const capability of [
      "household.manage",
      "place.write",
      "asset.write",
      "evidence.write"
    ]) {
      expect(provider).toContain(`requireCapabilities("${capability}"`);
    }
    expect(provider).toContain('if (!can("export.create"))');
  });

  it("denies a Place-capture deep link before rendering its form", () => {
    const capture = source("app/capture/index.tsx");
    const denial = capture.indexOf(
      'if (!can(placeOnly ? "place.write" : "asset.write"))'
    );
    const placeForm = capture.indexOf(
      'if (placeOnly) {\n    return (\n      <AppScreen'
    );

    expect(denial).toBeGreaterThan(-1);
    expect(placeForm).toBeGreaterThan(-1);
    expect(denial).toBeLessThan(placeForm);
  });
});
