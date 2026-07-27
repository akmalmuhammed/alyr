const { readFileSync } = jest.requireActual("fs") as {
  readFileSync(path: string, encoding: "utf8"): string;
};

function source(path: string): string {
  return readFileSync(`${process.cwd()}/${path}`, "utf8").replace(
    /\s+/gu,
    " "
  );
}

describe("localized provider errors on critical surfaces", () => {
  it("routes WorkspaceProvider messages through the locale boundary", () => {
    const welcome = source("app/(auth)/index.tsx");
    const asset = source("app/asset/[id].tsx");
    const place = source("app/place/[id].tsx");

    expect(welcome).toContain(
      "message={localizedWorkspaceError(error, language)}"
    );
    expect(asset).toContain(
      "message={localizedWorkspaceError(error, language)}"
    );
    expect(place).toContain(
      "message={localizedWorkspaceError(error, language)}"
    );

    expect(welcome).not.toContain("message={error}");
    expect(asset).not.toContain("message={error}");
    expect(place).not.toContain("message={error}");
  });

  it("routes onboarding AuthFailure messages through the locale boundary", () => {
    const household = source("app/(auth)/household.tsx");
    const privacy = source("app/(auth)/privacy.tsx");

    expect(household).toContain(
      "localizeAuthFailure(authError, language)"
    );
    expect(privacy).toContain(
      "message={localizeAuthFailure(authError, language)}"
    );
    expect(household).not.toContain("authError.message");
    expect(privacy).not.toContain("authError.message");
  });
});
