import {
  AUTH_ROUTES,
  AUTH_ROUTE_SEQUENCE,
  AUTH_ACTIVATION_STAGE_ORDER,
  HOUSEHOLD_ROUTES,
  authActivationProgress,
  firstRecordCaptureDestination
} from "@/auth/routes";
import { resolveFirstRecordHandoff } from "@/auth/firstRecordHandoff";

describe("auth route contract", () => {
  it("keeps the complete first-user sequence explicit", () => {
    expect(AUTH_ROUTE_SEQUENCE).toEqual([
      "welcome",
      "createAccount",
      "confirmEmail",
      "household",
      "privacy"
    ]);
    expect(AUTH_ROUTES).toMatchObject({
      welcome: "/(auth)",
      signIn: "/(auth)/sign-in",
      forgotPassword: "/(auth)/forgot-password",
      resetPassword: "/(auth)/reset-password",
      createAccount: "/(auth)/create-account",
      confirmEmail: "/(auth)/confirm-email",
      callback: "/(auth)/callback",
      household: "/(auth)/household",
      privacy: "/(auth)/privacy"
    });
    expect(HOUSEHOLD_ROUTES).toEqual({
      inviteMember: "/invite-member",
      memberAccess: "/member-access"
    });
  });

  it("names the three activation stages without counting the public account forms", () => {
    expect(AUTH_ACTIVATION_STAGE_ORDER).toEqual([
      "verifyAccount",
      "privateRecord",
      "firstPassport"
    ]);
    expect(authActivationProgress("confirmEmail")).toEqual({
      stage: "verifyAccount",
      position: 1,
      total: 3
    });
    expect(authActivationProgress("household")).toEqual({
      stage: "privateRecord",
      position: 2,
      total: 3
    });
    expect(authActivationProgress("privacy")).toEqual({
      stage: "firstPassport",
      position: 3,
      total: 3
    });

    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    for (const route of ["index", "create-account"]) {
      const source = readFileSync(
        `${process.cwd()}/app/(auth)/${route}.tsx`,
        "utf8"
      );
      expect(source).not.toContain("authActivationProgress(");
    }
  });

  it("routes each first-record intent without collapsing Place into item capture", () => {
    expect(firstRecordCaptureDestination("item")).toBe("/capture");
    expect(firstRecordCaptureDestination("place")).toBe(
      "/capture?intent=place"
    );
  });

  it("resumes the chosen record only after onboarding, vault release, and data readiness", () => {
    expect(
      resolveFirstRecordHandoff({
        dataRoutesReady: true,
        onboardingFinished: true,
        vaultReleased: true,
        intent: "place"
      })
    ).toBe("/capture?intent=place");
    expect(
      resolveFirstRecordHandoff({
        dataRoutesReady: true,
        onboardingFinished: true,
        vaultReleased: true,
        intent: "item"
      })
    ).toBe("/capture");
    for (const input of [
      {
        dataRoutesReady: false,
        onboardingFinished: true,
        vaultReleased: true,
        intent: "place" as const
      },
      {
        dataRoutesReady: true,
        onboardingFinished: false,
        vaultReleased: true,
        intent: "place" as const
      },
      {
        dataRoutesReady: true,
        onboardingFinished: true,
        vaultReleased: false,
        intent: "place" as const
      }
    ]) {
      expect(resolveFirstRecordHandoff(input)).toBeNull();
    }
  });

  it("keeps auth exits deterministic without verified-account redirect loops", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    for (const route of ["sign-in", "create-account"]) {
      const source = readFileSync(
        `${process.cwd()}/app/(auth)/${route}.tsx`,
        "utf8"
      );
      expect(source).toContain("router.canGoBack()");
      expect(source).toContain("router.replace(AUTH_ROUTES.welcome)");
    }

    const household = readFileSync(
      `${process.cwd()}/app/(auth)/household.tsx`,
      "utf8"
    );
    const authLayout = readFileSync(
      `${process.cwd()}/app/(auth)/_layout.tsx`,
      "utf8"
    );
    const privacy = readFileSync(
      `${process.cwd()}/app/(auth)/privacy.tsx`,
      "utf8"
    );
    expect(household).toContain(
      "return <Redirect href={AUTH_ROUTES.signIn} />"
    );
    expect(household).not.toContain("router.canGoBack()");
    expect(household).not.toContain("onBack=");
    expect(authLayout).toMatch(
      /name="household"[\s\S]*?gestureEnabled:\s*false/u
    );
    expect(authLayout).toMatch(
      /name="privacy"[\s\S]*?gestureEnabled:\s*false/u
    );
    expect(privacy).toContain(
      "router.replace(AUTH_ROUTES.household)"
    );
  });

  it("keeps one global auth provider and protects all record routes", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const rootLayout = readFileSync(
      `${process.cwd()}/app/_layout.tsx`,
      "utf8"
    );
    const authLayout = readFileSync(
      `${process.cwd()}/app/(auth)/_layout.tsx`,
      "utf8"
    );
    const confirmationRoute = readFileSync(
      `${process.cwd()}/app/(auth)/confirm-email.tsx`,
      "utf8"
    );
    const callbackRoute = readFileSync(
      `${process.cwd()}/app/(auth)/callback.tsx`,
      "utf8"
    );

    expect(rootLayout).toContain("<AuthFlowProvider");
    expect(rootLayout).toContain("<AuthBootstrapBoundary>");
    expect(rootLayout).toContain("householdAccess:");
    expect(rootLayout).toContain("<SessionBoundWorkspaceProvider>");
    expect(rootLayout).toContain(
      "installSignedSupabaseRuntimeFromEnvironment()"
    );
    expect(rootLayout).toContain(
      'session.onboarding === "complete"'
    );
    expect(rootLayout).toContain(
      "<Stack.Protected guard={dataRoutesReady}>"
    );
    expect(rootLayout).toContain("headerBackVisible: false");
    expect(rootLayout).toContain("headerRight: () =>");
    expect(rootLayout).toContain("headerLeft: () =>");
    expect(rootLayout).toContain("router.canGoBack()");
    expect(rootLayout).toContain("<ArrowRight");
    expect(rootLayout).toContain("<ArrowLeft");
    expect(rootLayout).toContain('name="invite-member"');
    expect(rootLayout).toContain('name="member-access"');
    expect(authLayout).not.toContain("<AuthFlowProvider");
    expect(authLayout).toContain("useAuthFlow()");
    expect(authLayout).toContain(
      "authenticatedAuthEntryDestination"
    );
    expect(confirmationRoute).toContain(
      "pendingHouseholdInvite\n              ? AUTH_ROUTES.join\n              : AUTH_ROUTES.household"
    );
    expect(callbackRoute).toContain(
      "localizeAuthFailure(error, language)"
    );
    expect(callbackRoute).not.toContain("message={error.message}");
  });
});
