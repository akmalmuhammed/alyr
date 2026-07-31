import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";

import { OnboardingExperience } from "@/onboarding/OnboardingExperience";

const mockSetLanguage = jest.fn(async () => undefined);

jest.mock("react-native-reanimated", () => {
  const {
    View: AnimatedView
  } = jest.requireActual("react-native") as typeof import("react-native");
  const transition = {
    duration: () => transition
  };
  return {
    __esModule: true,
    default: { View: AnimatedView },
    FadeIn: transition,
    FadeInLeft: transition,
    FadeInRight: transition,
    FadeOut: transition,
    FadeOutLeft: transition,
    FadeOutRight: transition
  };
});

jest.mock("@/accessibility/useReduceMotionPreference", () => ({
  useReduceMotionPreference: () => true
}));

jest.mock("@/i18n/LocaleProvider", () => ({
  useLocale: () => ({
    language: "en",
    locale: "en-QA",
    ready: true,
    rtl: false,
    setLanguage: mockSetLanguage
  })
}));

jest.mock("@/onboarding/OnboardingScenes", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } =
    jest.requireActual("react-native") as typeof import("react-native");
  return {
    OnboardingSceneArtwork: ({
      scene
    }: {
      readonly scene: number;
    }) => React.createElement(View, { testID: `artwork-${scene + 1}` })
  };
});

jest.mock("@/onboarding/WorldlineProgress", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } =
    jest.requireActual("react-native") as typeof import("react-native");
  return {
    WorldlineProgress: ({
      current
    }: {
      readonly current: number;
    }) =>
      React.createElement(View, {
        testID: `progress-${current + 1}`
      })
  };
});

jest.mock("react-native-safe-area-context", () => {
  const { View: SafeView } = jest.requireActual("react-native");
  return {
    SafeAreaView: SafeView,
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    })
  };
});

function actions() {
  return {
    onBegin: jest.fn(async () => undefined),
    onExploreSample: jest.fn(async () => undefined),
    onSignIn: jest.fn(async () => undefined),
    onSkip: jest.fn(async () => undefined)
  };
}

describe("Worldline onboarding experience", () => {
  it("moves through the four user-controlled scenes and preserves Back", async () => {
    const callbacks = actions();
    const screen = await render(
      <OnboardingExperience {...callbacks} />
    );

    expect(screen.getByTestId("onboarding-scene-1")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-scene-2")).toBeTruthy();
    expect(screen.getByTestId("progress-2")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-scene-3")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("onboarding-back"));
    expect(screen.getByTestId("onboarding-scene-2")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-scene-4")).toBeTruthy();
    expect(
      screen.getByTestId("onboarding-start-first-item")
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByTestId("onboarding-explore-sample")
    );
    await waitFor(() =>
      expect(callbacks.onExploreSample).toHaveBeenCalledTimes(1)
    );
    expect(callbacks.onBegin).not.toHaveBeenCalled();
  });

  it("keeps skip and existing-user entry explicit on the opening scene", async () => {
    const callbacks = actions();
    const screen = await render(
      <OnboardingExperience {...callbacks} />
    );

    await fireEvent.press(screen.getByTestId("onboarding-skip"));
    await waitFor(() =>
      expect(callbacks.onSkip).toHaveBeenCalledTimes(1)
    );

    const signInCallbacks = actions();
    const signInScreen = await render(
      <OnboardingExperience {...signInCallbacks} />
    );
    await fireEvent.press(
      signInScreen.getByTestId("onboarding-sign-in")
    );
    await waitFor(() =>
      expect(signInCallbacks.onSignIn).toHaveBeenCalledTimes(1)
    );
  });

  it("disables sample entry when the local vault is not ready", async () => {
    const callbacks = actions();
    const screen = await render(
      <OnboardingExperience
        {...callbacks}
        sampleEnabled={false}
      />
    );
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await fireEvent.press(screen.getByTestId("onboarding-next"));

    expect(
      screen.getByTestId("onboarding-explore-sample").props
        .accessibilityState.disabled
    ).toBe(true);
  });
});
