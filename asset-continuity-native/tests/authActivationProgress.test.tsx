import { render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import {
  StyleSheet,
  Text
} from "react-native";

import { AuthScaffold } from "@/auth/components";
import { authActivationProgress } from "@/auth/routes";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { colors, typography } from "@/theme/tokens";

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

function englishWrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider initialLanguage="en">
      {children}
    </LocaleProvider>
  );
}

function arabicWrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider initialLanguage="ar">
      {children}
    </LocaleProvider>
  );
}

function styleOf(value: unknown): Record<string, unknown> {
  return StyleSheet.flatten(value) as Record<string, unknown>;
}

describe("named account activation progress", () => {
  it("labels the current stage and exposes a useful screen-reader value", async () => {
    const screen = await render(
      <AuthScaffold
        onBack={jest.fn()}
        progress={authActivationProgress("confirmEmail")}
      >
        <Text>Confirmation content</Text>
      </AuthScaffold>,
      { wrapper: englishWrapper }
    );

    const progress = screen.getByRole("progressbar", {
      name: CORE_JOURNEY_COPY.en.activationProgress.label
    });
    expect(progress.props.accessibilityValue).toEqual({
      min: 1,
      max: 3,
      now: 1,
      text: "Verify account. Activation stage 1 of 3."
    });
    expect(
      screen.getByTestId("auth-activation-current-stage").props.children
    ).toBe("Verify account");
    expect(screen.queryByText("Step 1 of 3")).toBeNull();

    const currentSegment = styleOf(
      screen.getByTestId(
        "auth-activation-segment-verifyAccount",
        { includeHiddenElements: true }
      ).props.style
    );
    const futureSegment = styleOf(
      screen.getByTestId(
        "auth-activation-segment-privateRecord",
        { includeHiddenElements: true }
      ).props.style
    );
    expect(currentSegment.backgroundColor).toBe(colors.action);
    expect(futureSegment.backgroundColor).toBe(colors.border);
  });

  it("shrinks and wraps its named stage instead of clipping at 320 px", async () => {
    const screen = await render(
      <AuthScaffold
        onBack={jest.fn()}
        progress={authActivationProgress("privacy")}
      >
        <Text>First Passport content</Text>
      </AuthScaffold>,
      { wrapper: englishWrapper }
    );

    const block = styleOf(
      screen.getByTestId("auth-activation-progress").props.style
    );
    const label = screen.getByTestId(
      "auth-activation-current-stage"
    );
    const labelStyle = styleOf(label.props.style);

    expect(block.maxWidth).toBe(200);
    expect(block.minWidth).toBe(0);
    expect(block.flexShrink).toBe(1);
    expect(labelStyle.flexShrink).toBe(1);
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it("mirrors the rail and reads the Arabic stage natively", async () => {
    const screen = await render(
      <AuthScaffold
        onBack={jest.fn()}
        progress={authActivationProgress("household")}
      >
        <Text>محتوى السجل الخاص</Text>
      </AuthScaffold>,
      { wrapper: arabicWrapper }
    );

    const progress = screen.getByRole("progressbar", {
      name: CORE_JOURNEY_COPY.ar.activationProgress.label
    });
    expect(progress.props.accessibilityValue).toEqual({
      min: 1,
      max: 3,
      now: 2,
      text: "السجل الخاص. المرحلة ٢ من ٣ لتفعيل الحساب."
    });
    expect(
      screen.getByTestId("auth-activation-current-stage").props.children
    ).toBe("السجل الخاص");

    const railStyle = styleOf(
      screen.getByTestId("auth-activation-rail", {
        includeHiddenElements: true
      }).props.style
    );
    const labelStyle = styleOf(
      screen.getByTestId(
        "auth-activation-current-stage"
      ).props.style
    );
    expect(railStyle.flexDirection).toBe("row-reverse");
    expect(labelStyle.fontFamily).toBe(typography.arabicMedium);
    expect(labelStyle.writingDirection).toBe("rtl");
    expect(labelStyle.textAlign).toBe("right");
  });
});
