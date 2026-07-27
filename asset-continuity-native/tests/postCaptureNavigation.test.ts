describe("post-capture navigation contract", () => {
  it("marks a newly created Passport and provides a clear route to Today", () => {
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

    expect(captureRoute).toContain(
      "router.replace(`/asset/${asset.id}?justCreated=1`);"
    );
    expect(passportRoute).toContain('justCreated === "1"');
    expect(passportRoute).toContain("Passport saved");
    expect(passportRoute).toContain("Go to Today");
    expect(passportRoute).toContain('router.replace("/(tabs)")');
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
