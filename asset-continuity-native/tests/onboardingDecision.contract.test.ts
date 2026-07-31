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

  it("gates ordinary first launch through Worldline without competing with auth or restored workspaces", () => {
    const indexRoute = read("app/index.tsx");
    const rootLayout = read("app/_layout.tsx");
    const authLayout = read("app/(auth)/_layout.tsx");
    const onboardingRoute = read("app/(onboarding)/index.tsx");

    expect(rootLayout).toContain("<OnboardingIntroProvider>");
    expect(rootLayout).toContain(
      'options={{ animation: "none", headerShown: false }}'
    );
    expect(indexRoute).toContain(
      "const { status: introStatus } = useOnboardingIntro();"
    );
    expect(indexRoute).toContain(
      'introStatus === "unseen"'
    );
    expect(indexRoute).toContain(
      '<Redirect href="/(onboarding)" />'
    );
    expect(indexRoute).toContain(
      'return workspace ? <Redirect href="/(tabs)" /> : publicEntry();'
    );
    expect(indexRoute).toContain(
      'testID="signed-sample-bootstrap"'
    );
    expect(
      indexRoute.indexOf("signedOutSampleOpening")
    ).toBeLessThan(
      indexRoute.indexOf("signedOutSampleWorkspaceReady(")
    );
    expect(indexRoute).toContain(
      'if (mode !== "supabase" || !session) {\n    return publicEntry();'
    );
    expect(
      indexRoute.indexOf("signedOutSampleWorkspaceReady(")
    ).toBeLessThan(
      indexRoute.indexOf(
        'if (mode !== "supabase" || !session)'
      )
    );
    expect(authLayout).not.toContain("OnboardingIntro");
    expect(onboardingRoute).toContain("await markSeen();");
    expect(onboardingRoute).toContain(
      "router.replace(AUTH_ROUTES.createAccount);"
    );
    expect(onboardingRoute).toContain(
      "await startWorkspace(\"sample\");"
    );
  });

  it("places the first-record decision before trust explanation", () => {
    const source = read("app/(auth)/privacy.tsx");

    expect(source.indexOf("accessibilityLabel={copy.privacy.chooseFirst}")).toBeLessThan(
      source.indexOf("<View style={styles.principles}>")
    );
    expect(
      source.indexOf('testID="onboarding-device-preflight"')
    ).toBeLessThan(
      source.indexOf("<View style={styles.principles}>")
    );
    expect(CORE_JOURNEY_COPY.en.privacy.chooseFirst).toBe(
      "Choose your first Passport"
    );
  });

  it("checks and authorizes the device before committing setup, then hands off the exact intent", () => {
    const privacy = read("app/(auth)/privacy.tsx");
    const rootLayout = read("app/_layout.tsx");
    const routes = read("src/auth/routes.ts");
    const capture = read("app/capture/index.tsx");
    const provider = read(
      "src/deviceAuth/DeviceAuthProvider.tsx"
    );
    const sessionBoundary = read(
      "src/state/SessionBoundWorkspaceProvider.tsx"
    );

    expect(privacy).toContain(
      "const authorization = await authorizeOnboarding("
    );
    expect(privacy).toContain(
      "pendingFirstRecordIntent &&\n      storageReady"
    );
    expect(privacy).toContain(
      'onboardingHandoffRestoreState === "error"'
    );
    expect(privacy).toContain(
      "retryOnboardingHandoffRestore();"
    );
    expect(privacy).toContain(
      'onboardingHandoffRestoreState !== "ready"'
    );
    expect(privacy).toContain(
      "void commitAuthorizedOnboarding("
    );
    const disabledBlock = privacy.slice(
      privacy.indexOf("disabled:"),
      privacy.indexOf("onPress: () => void finish()")
    );
    expect(disabledBlock).not.toContain("!storageReady");
    expect(privacy).toContain(
      "onboardingPreflight.phase === \"unavailable\""
    );
    expect(provider).toContain(
      "await onboardingHandoffStore.save("
    );
    expect(provider).toContain(
      'onboardingHandoffRestoreState !== "ready"'
    );
    expect(
      provider.indexOf("await onboardingHandoffStore.save(")
    ).toBeLessThan(
      provider.indexOf("onboardingGrantRef.current = {")
    );
    expect(provider).toContain(
      "vaultReleased:\n        !nativeSubjectProtection"
    );
    expect(sessionBoundary).toContain(
      "access?.kind === \"authenticated\" && !deviceAuthReleased"
    );
    expect(rootLayout).toContain(
      "resolveFirstRecordHandoff({"
    );
    expect(rootLayout).toContain("firstRecordHandoffDestination");
    expect(rootLayout).toContain(
      "pendingFirstRecordHandoff.handoffId"
    );
    expect(rootLayout).not.toContain(
      "acknowledgeOnboardingHandoff("
    );
    expect(capture).toContain(
      "await deviceAuth.acknowledgeOnboardingHandoff({"
    );
    expect(routes).toContain(
      'return intent === "place" ? "/capture?intent=place" : "/capture";'
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
        "const result = await access.createHousehold({"
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
