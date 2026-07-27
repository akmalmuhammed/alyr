import {
  fireEvent,
  render
} from "@testing-library/react-native";
import { Text } from "react-native";

import { AuthBootstrapBoundary } from "@/auth/AuthBootstrapBoundary";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

let mockAuthState: Record<string, unknown>;

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthState
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    })
  };
});

function errorState() {
  return {
    bootstrapState: "error",
    busy: false,
    error: {
      code: "network_unavailable",
      message: "provider detail must stay private",
      retryable: true
    },
    retryBootstrap: jest.fn(async () => true),
    signOut: jest.fn(async () => true)
  };
}

describe("auth bootstrap recovery boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = errorState();
  });

  it("surfaces a localized fail-closed error with retry and recovery", async () => {
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <AuthBootstrapBoundary>
          <Text testID="private-routes">Private routes</Text>
        </AuthBootstrapBoundary>
      </LocaleProvider>
    );

    expect(screen.getByTestId("auth-bootstrap-error")).toBeTruthy();
    expect(screen.queryByTestId("private-routes")).toBeNull();
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.authErrors.network_unavailable
      )
    ).toBeTruthy();
    expect(
      screen.queryByText("provider detail must stay private")
    ).toBeNull();

    await fireEvent.press(screen.getByText("Try again"));
    expect(mockAuthState.retryBootstrap).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText("Sign out"));
    expect(mockAuthState.signOut).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("renders an Arabic RTL recovery surface", async () => {
    const screen = await render(
      <LocaleProvider initialLanguage="ar">
        <AuthBootstrapBoundary>
          <Text testID="private-routes">Private routes</Text>
        </AuthBootstrapBoundary>
      </LocaleProvider>
    );

    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.ar.authErrors.network_unavailable
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649"
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("private-routes")).toBeNull();
    await screen.unmount();
  });

  it("shows progress while session state is unknown and releases only ready state", async () => {
    mockAuthState = {
      ...errorState(),
      bootstrapState: "bootstrapping",
      error: null
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <AuthBootstrapBoundary>
          <Text testID="private-routes">Private routes</Text>
        </AuthBootstrapBoundary>
      </LocaleProvider>
    );

    expect(screen.getByTestId("auth-bootstrap-checking")).toBeTruthy();
    expect(screen.queryByTestId("private-routes")).toBeNull();

    mockAuthState = {
      ...mockAuthState,
      bootstrapState: "ready"
    };
    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <AuthBootstrapBoundary>
          <Text testID="private-routes">Private routes</Text>
        </AuthBootstrapBoundary>
      </LocaleProvider>
    );
    expect(screen.getByTestId("private-routes")).toBeTruthy();
    expect(
      screen.queryByTestId("auth-bootstrap-checking")
    ).toBeNull();
    await screen.unmount();
  });
});
