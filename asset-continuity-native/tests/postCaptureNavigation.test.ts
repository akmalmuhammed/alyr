describe("post-capture navigation contract", () => {
  it("marks a newly created Passport and hands off to Today before optional completion", () => {
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
      "navigateAfterCommittedRecord(record.kind, record.id)"
    );
    expect(captureRoute).toContain(
      "`/asset/${recordId}?justCreated=1`"
    );
    expect(passportRoute).toContain('justCreated === "1"');
    expect(passportRoute).toContain("Passport saved");
    expect(passportRoute).toContain("Passport started");
    expect(passportRoute).toContain(
      "const receiptComplete = missing.length === 0"
    );
    expect(passportRoute).toContain("Add another item");
    expect(passportRoute).toContain("View full Passport");
    expect(passportRoute).toContain("View Today");
    expect(passportRoute).not.toContain("returnTo=dashboard");
    expect(passportRoute).toContain('router.replace("/capture")');
    expect(passportRoute).toContain('router.replace("/(tabs)")');
    expect(passportRoute).toContain(
      "router.replace(`/asset/${asset.id}`)"
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
