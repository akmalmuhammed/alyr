import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";

describe("first-viewport onboarding decisions", () => {
  const read = (path: string) => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(filePath: string, encoding: "utf8"): string;
    };
    return readFileSync(`${process.cwd()}/${path}`, "utf8");
  };

  it("keeps Create, Explore sample and Sign in in fixed welcome actions", () => {
    const source = read("app/(auth)/index.tsx");

    expect(source).toContain("label: copy.welcome.createWorkspace");
    expect(source).toContain("copy.welcome.exploreSample");
    expect(source).toContain(
      "label={copy.welcome.signIn} onPress={signIn}"
    );
    expect(CORE_JOURNEY_COPY.en.welcome.createWorkspace).toBe(
      "Create private workspace"
    );
    expect(CORE_JOURNEY_COPY.en.welcome.exploreSample).toBe(
      "Explore sample"
    );
    expect(CORE_JOURNEY_COPY.en.welcome.signIn).toBe("Sign in");
    expect(source.indexOf("copy.welcome.exploreSample")).toBeLessThan(
      source.indexOf('testID="auth-welcome-screen"')
    );
  });

  it("places the first-record decision before trust explanation", () => {
    const source = read("app/(auth)/privacy.tsx");

    expect(source.indexOf("accessibilityLabel={copy.privacy.chooseFirst}")).toBeLessThan(
      source.indexOf("<View style={styles.principles}>")
    );
    expect(CORE_JOURNEY_COPY.en.privacy.chooseFirst).toBe(
      "Choose first record"
    );
  });

  it("restores an existing signed household without re-entering creation", () => {
    const source = read("app/index.tsx");
    const authProvider = read(
      "src/auth/AuthFlowProvider.tsx"
    );
    const householdScreen = read(
      "app/(auth)/household.tsx"
    );

    expect(source).toMatch(
      /if\s*\(\s*!session\.activeHouseholdId\s*\|\|\s*!session\.activeMembershipId\s*\|\|\s*!session\.activeHouseholdRole\s*\)/
    );
    expect(source).not.toContain(
      "if (!session.activeHouseholdId || !workspace)"
    );
    expect(source).toContain(
      'testID="signed-workspace-bootstrap"'
    );
    expect(source).toContain("retryBootstrap");
    expect(source).toContain(
      'bootstrap.status === "access-revoked"'
    );
    expect(
      authProvider.indexOf("if (session.activeHouseholdId)")
    ).toBeLessThan(
      authProvider.indexOf(
        "const result = await access.createHousehold(name)"
      )
    );
    expect(householdScreen).toContain(
      'session.onboarding === "complete"'
    );
    expect(householdScreen).toContain(
      'return <Redirect href="/" />'
    );
  });

  it("keeps a signed-out Supabase sample inside every protected-route gate", () => {
    const indexRoute = read("app/index.tsx");
    const rootLayout = read("app/_layout.tsx");
    const tabsLayout = read("app/(tabs)/_layout.tsx");
    const sessionBoundary = read(
      "src/state/SessionBoundWorkspaceProvider.tsx"
    );

    expect(sessionBoundary).toContain(
      '(mode === "supabase" && session === null)'
    );
    expect(sessionBoundary).toContain(
      "export function signedOutSampleWorkspaceReady"
    );
    expect(indexRoute).toContain(
      "signedOutSampleWorkspaceReady("
    );
    expect(rootLayout).toContain(
      "signedOutSampleWorkspaceReady("
    );
    expect(rootLayout).toContain(
      "mode === \"preview\" || localSampleReady || signedSessionReady"
    );
    expect(tabsLayout).toContain(
      "mode !== \"preview\" && !localSampleReady && !signedSessionReady"
    );
  });
});
