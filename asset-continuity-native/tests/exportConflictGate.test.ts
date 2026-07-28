import {
  cloudExportBlocker,
  type CloudExportBlocker
} from "../app/export-create";

describe("cloud export consistency gate", () => {
  it.each<
    readonly [number, number, CloudExportBlocker]
  >([
    [0, 0, null],
    [2, 0, "pending"],
    [0, 1, "conflict"],
    [2, 1, "conflict"]
  ])(
    "maps %i pending operations and %i conflicts to %s",
    (pending, conflicts, expected) => {
      expect(cloudExportBlocker(pending, conflicts)).toBe(expected);
    }
  );

  it("routes unresolved conflicts to the review inbox before export", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/export-create.tsx`,
      "utf8"
    );

    expect(source).toContain('testID="export-conflict-blocker"');
    expect(source).toContain('router.push("/sync-conflicts")');
    expect(source).toContain("disabled={exportBlocker !== null}");
    expect(source).toMatch(
      /if \(\s*!cloudExport \|\|\s*!verifiedCloudAccess \|\|[\s\S]*?exportBlocker[\s\S]*?\) \{\s*return;/u
    );
  });
});
