import { syncConflictCopy } from "@/i18n/syncConflictCopy";

describe("sync conflict review flow contract", () => {
  const { readFileSync } = jest.requireActual("fs") as {
    readFileSync(path: string, encoding: "utf8"): string;
  };

  it("routes conflict truth from Today and Vault into a stable review page", () => {
    const today = readFileSync(
      `${process.cwd()}/app/(tabs)/index.tsx`,
      "utf8"
    );
    const vault = readFileSync(
      `${process.cwd()}/app/(tabs)/vault.tsx`,
      "utf8"
    );
    const layout = readFileSync(
      `${process.cwd()}/app/_layout.tsx`,
      "utf8"
    );

    expect(today).toContain('"/sync-conflicts"');
    expect(vault).toContain('"/sync-conflicts"');
    expect(layout).toContain('name="sync-conflicts"');
  });

  it("shows source-separated values and only reviewed resolution actions", () => {
    const route = readFileSync(
      `${process.cwd()}/app/sync-conflicts.tsx`,
      "utf8"
    );

    expect(route).toContain("conflictProvenanceValues");
    expect(route).toContain('options.includes("keep-cloud")');
    expect(route).toContain('options.includes("reapply-local")');
    expect(route).toContain("conflictManualReviewRoute");
    expect(route).toContain("confirmResolution");
    expect(route).not.toContain("conflict.message");
  });

  it("keeps English and Arabic review copy in parity without mojibake", () => {
    const english = syncConflictCopy("en");
    const arabic = syncConflictCopy("ar");

    expect(Object.keys(arabic).sort()).toEqual(
      Object.keys(english).sort()
    );
    const serialized = JSON.stringify(arabic);
    expect(serialized).toMatch(/[\u0600-\u06ff]/u);
    expect(serialized).not.toMatch(/[\u0080-\u009f\uFFFD]/u);
  });
});
