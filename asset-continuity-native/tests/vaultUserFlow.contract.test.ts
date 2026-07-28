describe("Vault user-flow contract", () => {
  it("keeps the real data-export action visible outside diagnostics", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/vault.tsx`,
      "utf8"
    );
    const portability = source.indexOf("copy.vault.dataPortability");
    const diagnostics = source.indexOf("copy.vault.advancedDiagnostics");

    expect(portability).toBeGreaterThan(-1);
    expect(source).toContain("copy.vault.exportReadable");
    expect(portability).toBeLessThan(diagnostics);
    expect(source).not.toContain("Export readable diagnostic copy");
  });

  it("lets the household switch the persisted interface language", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/vault.tsx`,
      "utf8"
    );

    expect(source).toContain("useCoreJourneyCopy");
    expect(source).toContain('setLanguage("en")');
    expect(source).toContain('changeLanguage("en")');
    expect(source).toContain('setLanguage("ar")');
    expect(source).toContain('changeLanguage("ar")');
    expect(source).not.toMatch(
      /active=\{language === "ar"\}[\s\S]{0,80}\bdisabled\b/u
    );
  });

  it("separates signed account deletion from truthful preview reset", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const vaultSource = readFileSync(
      `${process.cwd()}/app/(tabs)/vault.tsx`,
      "utf8"
    );
    const routeSource = readFileSync(
      `${process.cwd()}/app/account-delete.tsx`,
      "utf8"
    );
    const providerSource = readFileSync(
      `${process.cwd()}/src/state/WorkspaceProvider.tsx`,
      "utf8"
    );

    expect(vaultSource).toContain("accountCopy.vault.deleteAccount");
    expect(vaultSource).toContain("accountCopy.vault.resetPreview");
    expect(routeSource).toContain("deleteAccount(password, confirmationEmail)");
    expect(routeSource).toContain("await purgeActiveVault()");
    expect(routeSource).toContain("reopenEmptyPreview: true");
    expect(routeSource).toContain("await finalizeAccountDeletion()");
    expect(routeSource.match(/setCloudDeleted\(true\)/gu)).toHaveLength(1);
    expect(routeSource).toMatch(
      /if \(!result\.ok\)[\s\S]*?return;[\s\S]*?setCloudDeleted\(true\)/u
    );
    expect(routeSource).toContain(
      '<Redirect href={AUTH_ROUTES.welcome} />'
    );
    expect(routeSource).toContain('testID="account-delete-loading"');
    expect(routeSource).not.toContain(
      "if (!workspace || (!signedAccount && !preview))"
    );
    expect(providerSource).toContain("activeRepository.purge()");
    expect(providerSource).toContain("activeAttachmentStore?.purge()");
  });

  it("routes sample conversion through a confirmed first-record choice and returns completed capture to Today", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const vaultSource = readFileSync(
      `${process.cwd()}/app/(tabs)/vault.tsx`,
      "utf8"
    );
    const activationSource = readFileSync(
      `${process.cwd()}/src/navigation/sampleActivation.ts`,
      "utf8"
    );
    const conversionSource = readFileSync(
      `${process.cwd()}/app/personal-start.tsx`,
      "utf8"
    );
    const captureSource = readFileSync(
      `${process.cwd()}/app/capture/index.tsx`,
      "utf8"
    );
    const copySource = readFileSync(
      `${process.cwd()}/src/i18n/sampleConversionCopy.ts`,
      "utf8"
    );

    expect(vaultSource).toContain("sampleActivationDestination({");
    expect(vaultSource).toContain(
      "router.push(sampleActivationRoute)"
    );
    expect(activationSource).toContain(
      'if (input.mode === "preview") return "/personal-start";'
    );
    expect(activationSource).toContain(
      "return AUTH_ROUTES.createAccount;"
    );
    expect(vaultSource).not.toContain(
      "void replaceWithPersonalWorkspace()"
    );
    expect(conversionSource).toContain(
      "await replaceWithPersonalWorkspace()"
    );
    expect(conversionSource).toContain(
      'params: { returnTo: "today" }'
    );
    expect(conversionSource).toContain(
      'params: { intent: "place", returnTo: "today" }'
    );
    expect(captureSource).toMatch(
      /returnTo === "today"[\s\S]{0,100}router\.replace\("\/"\)/u
    );
    expect(copySource).toContain(
      "It does not create an account, cloud backup or family membership."
    );
  });
});
