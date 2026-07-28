describe("versioned pilot policy and support surfaces", () => {
  const read = (path: string) => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(filePath: string, encoding: "utf8"): string;
    };
    return readFileSync(`${process.cwd()}/${path}`, "utf8");
  };

  it("keeps privacy, terms and support available before authentication", () => {
    const root = read("app/_layout.tsx");

    expect(root).toContain('name="privacy-policy"');
    expect(root).toContain('name="terms"');
    expect(root).toContain('name="support"');
    expect(root.indexOf('name="privacy-policy"')).toBeLessThan(
      root.indexOf("<Stack.Protected")
    );
  });

  it("links policy and terms before account creation", () => {
    const account = read("app/(auth)/create-account.tsx");

    expect(account).toContain('router.push("/privacy-policy")');
    expect(account).toContain('router.push("/terms")');
    expect(account.indexOf('router.push("/privacy-policy")')).toBeLessThan(
      account.indexOf("</AuthScaffold>")
    );
  });

  it("keeps all three documents reachable from Vault", () => {
    const vault = read("app/(tabs)/vault.tsx");

    expect(vault).toContain('router.push("/privacy-policy")');
    expect(vault).toContain('router.push("/terms")');
    expect(vault).toContain('router.push("/support")');
  });

  it("states an effective date and an honest sample-versus-personal boundary", () => {
    const document = read(
      "src/components/LegalDocumentScreen.tsx"
    );

    expect(document).toContain('version: "Effective 28 July 2026"');
    expect(document).toContain(
      "Closed pilot · Last revised 28 July 2026"
    );
    expect(document).toContain(
      "The sample workspace stays isolated on this device"
    );
    expect(document).toContain(
      "Closed-pilot product measurement"
    );
    expect(document).toContain(
      "Asset names, recorded amounts, addresses, coordinates"
    );
    expect(document).not.toContain(
      "Expo Go"
    );
    expect(document).toContain("ساري من 28 يوليو 2026");
    expect(document).toContain("تجربة مغلقة");
    expect(document).toContain("قياس استخدام التجربة المغلقة");
  });
});
