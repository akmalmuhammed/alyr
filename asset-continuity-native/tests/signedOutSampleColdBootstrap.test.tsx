import { render } from "@testing-library/react-native";

import IndexScreen from "../app/index";
import { createWorkspace } from "@/domain/sample";

let mockWorkspaceState: Record<string, unknown>;

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual(
    "react-native"
  ) as typeof import("react-native");
  return {
    Redirect: ({ href }: { readonly href: string }) =>
      React.createElement(Text, { testID: "root-redirect" }, href)
  };
});

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => ({
    bootstrapState: "ready",
    busy: false,
    mode: "supabase",
    pendingHouseholdInvite: null,
    pendingHouseholdInviteDeferred: false,
    session: null,
    signOut: jest.fn()
  })
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => mockWorkspaceState
}));

jest.mock("@/onboarding/OnboardingIntroProvider", () => ({
  useOnboardingIntro: () => ({ status: "seen" })
}));

jest.mock("@/i18n/coreJourneyCopy", () => ({
  localizedWorkspaceError: (message: string) => message,
  useCoreJourneyCopy: () => ({ language: "en" })
}));

describe("signed-out sample cold bootstrap", () => {
  beforeEach(() => {
    mockWorkspaceState = {
      bootstrap: { status: "opening", lastError: null },
      loading: true,
      retryBootstrap: jest.fn(),
      workspace: null
    };
  });

  it("waits for the encrypted sample vault before choosing a public route", async () => {
    const screen = await render(<IndexScreen />);

    expect(screen.getByTestId("signed-sample-bootstrap")).toBeTruthy();
    expect(screen.queryByTestId("root-redirect")).toBeNull();

    mockWorkspaceState = {
      ...mockWorkspaceState,
      bootstrap: { status: "ready", lastError: null },
      loading: false,
      workspace: createWorkspace("sample")
    };
    await screen.rerender(<IndexScreen />);

    expect(screen.getByTestId("root-redirect").props.children).toBe(
      "/(tabs)"
    );
  });

  it("opens Welcome after an empty sample vault finishes loading", async () => {
    mockWorkspaceState = {
      ...mockWorkspaceState,
      bootstrap: { status: "ready", lastError: null },
      loading: false
    };
    const screen = await render(<IndexScreen />);

    expect(screen.getByTestId("root-redirect").props.children).toBe(
      "/(auth)"
    );
  });
});
