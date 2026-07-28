import {
  fireEvent,
  render
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";

import { AuthField } from "@/auth/components";
import { LocaleProvider } from "@/i18n/LocaleProvider";

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

describe("AuthField password visibility", () => {
  it("reveals and hides a password without clearing the value or blurring the field", async () => {
    const onBlur = jest.fn();
    const screen = await render(
      <AuthField
        label="Password"
        onBlur={onBlur}
        passwordVisibility={{
          showLabel: "Show password",
          hideLabel: "Hide password"
        }}
        secureTextEntry
        value="correct horse battery staple"
      />,
      { wrapper: englishWrapper }
    );

    const input = screen.getByLabelText("Password");
    expect(input.props.secureTextEntry).toBe(true);
    expect(
      screen.getByRole("button", { name: "Show password" }).props
        .accessibilityState
    ).toEqual({ expanded: false });

    fireEvent(input, "focus");
    await fireEvent.press(
      screen.getByRole("button", { name: "Show password" })
    );

    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(
      false
    );
    expect(screen.getByLabelText("Password").props.value).toBe(
      "correct horse battery staple"
    );
    expect(onBlur).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Hide password" }).props
        .accessibilityState
    ).toEqual({ expanded: true });

    await fireEvent.press(
      screen.getByRole("button", { name: "Hide password" })
    );
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(
      true
    );
  });

  it("places the localized control on the trailing edge in Arabic RTL", async () => {
    const screen = await render(
      <AuthField
        label="كلمة المرور"
        passwordVisibility={{
          showLabel: "إظهار كلمة المرور",
          hideLabel: "إخفاء كلمة المرور"
        }}
        secureTextEntry
        value="سر تجريبي"
      />,
      { wrapper: arabicWrapper }
    );

    const actionStyle = StyleSheet.flatten(
      screen.getByRole("button", {
        name: "إظهار كلمة المرور"
      }).props.style
    );
    const inputStyle = StyleSheet.flatten(
      screen.getByLabelText("كلمة المرور").props.style
    );

    expect(actionStyle.left).toBe(5);
    expect(actionStyle.right).toBeUndefined();
    expect(inputStyle.paddingLeft).toBe(56);
  });
});
