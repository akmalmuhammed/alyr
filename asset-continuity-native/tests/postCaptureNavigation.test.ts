describe("post-capture navigation contract", () => {
  it("marks a newly created Passport and exposes one focused activation path", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const captureRoute = readFileSync(
      `${process.cwd()}/app/capture/index.tsx`,
      "utf8"
    );
    const passportRoute = readFileSync(
      `${process.cwd()}/app/asset/[id].tsx`,
      "utf8"
    );
    const valueRoute = readFileSync(
      `${process.cwd()}/app/asset-value.tsx`,
      "utf8"
    );

    expect(captureRoute).toContain(
      "router.replace(`/asset/${asset.id}?justCreated=1`);"
    );
    expect(passportRoute).toContain('justCreated === "1"');
    expect(passportRoute).toContain("Passport saved");
    expect(passportRoute).toContain("Add value to portfolio");
    expect(passportRoute).toContain("Add another item");
    expect(passportRoute).toContain("View full Passport");
    expect(passportRoute).toContain("View Today");
    expect(passportRoute).toContain("returnTo=dashboard");
    expect(passportRoute).toContain('router.replace("/capture")');
    expect(passportRoute).toContain('router.replace("/(tabs)")');
    expect(passportRoute).toContain(
      "router.replace(`/asset/${asset.id}`)"
    );
    expect(valueRoute.indexOf('if (returnTo === "dashboard")')).toBeLessThan(
      valueRoute.indexOf("router.canGoBack()")
    );
  });

  it("closes capture through a stable root route when no back entry exists", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const captureRoute = readFileSync(
      `${process.cwd()}/app/capture/index.tsx`,
      "utf8"
    );

    expect(captureRoute).toContain("navigation.canGoBack()");
    expect(captureRoute).toContain('router.replace("/")');
  });
});
