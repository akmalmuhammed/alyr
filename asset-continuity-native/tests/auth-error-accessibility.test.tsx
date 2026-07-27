import {
  render,
  waitFor
} from "@testing-library/react-native";
import type { RefObject } from "react";
import {
  AccessibilityInfo,
  Platform,
  type TextInput
} from "react-native";

import {
  AuthField,
  focusFirstInvalidAuthField
} from "@/auth/components";
import { ErrorBanner } from "@/components/ui";

function fieldRef(focus: jest.Mock): RefObject<TextInput | null> {
  return {
    current: { focus } as unknown as TextInput
  };
}

describe("iOS form error accessibility", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("announces each new banner message once on iOS and exposes alert semantics", async () => {
    expect(Platform.OS).toBe("ios");
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    const dismiss = jest.fn();
    const screen = await render(
      <ErrorBanner message="Account details were not accepted." onDismiss={dismiss} />
    );

    await waitFor(() => {
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenLastCalledWith(
        "Error. Account details were not accepted."
      );
    });
    expect(
      screen.getByText("Account details were not accepted.").props
        .accessibilityRole
    ).toBe("alert");

    await screen.rerender(
      <ErrorBanner message="Account details were not accepted." onDismiss={dismiss} />
    );
    expect(announce).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <ErrorBanner message="Connection was interrupted." onDismiss={dismiss} />
    );
    await waitFor(() => {
      expect(announce).toHaveBeenCalledTimes(2);
      expect(announce).toHaveBeenLastCalledWith(
        "Error. Connection was interrupted."
      );
    });
    await screen.unmount();
  });

  it("associates inline errors with the field without a competing live announcement", async () => {
    const screen = await render(
      <AuthField
        error="Enter a complete email address."
        label="Email"
        onChangeText={() => undefined}
        value=""
      />
    );
    const field = screen.getByLabelText("Email");
    const error = screen.getByText("Enter a complete email address.");

    expect(field.props["aria-invalid"]).toBe(true);
    expect(field.props.accessibilityHint).toContain(
      "Enter a complete email address."
    );
    expect(error.props.accessibilityLiveRegion).toBeUndefined();
    expect(error.props.accessibilityRole).toBeUndefined();
    await screen.unmount();
  });

  it("schedules focus only for the first invalid field", () => {
    const emailFocus = jest.fn();
    const passwordFocus = jest.fn();
    const confirmFocus = jest.fn();
    const schedule = jest.fn((focus: () => void) => focus());

    expect(
      focusFirstInvalidAuthField(
        [
          { error: "Email is invalid.", ref: fieldRef(emailFocus) },
          { error: "Password is invalid.", ref: fieldRef(passwordFocus) },
          { error: "Passwords differ.", ref: fieldRef(confirmFocus) }
        ],
        schedule
      )
    ).toBe(true);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(emailFocus).toHaveBeenCalledTimes(1);
    expect(passwordFocus).not.toHaveBeenCalled();
    expect(confirmFocus).not.toHaveBeenCalled();

    expect(
      focusFirstInvalidAuthField(
        [
          { error: null, ref: fieldRef(emailFocus) },
          { error: undefined, ref: fieldRef(passwordFocus) }
        ],
        schedule
      )
    ).toBe(false);
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
