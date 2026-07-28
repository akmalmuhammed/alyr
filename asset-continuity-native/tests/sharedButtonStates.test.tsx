import { fireEvent, render } from "@testing-library/react-native";
import { ArrowClockwise } from "phosphor-react-native";
import type { PropsWithChildren } from "react";

import { SecondaryButton } from "@/components/ui";
import { LocaleProvider } from "@/i18n/LocaleProvider";

function wrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider initialLanguage="en">
      {children}
    </LocaleProvider>
  );
}

describe("shared button states", () => {
  it("keeps a loading secondary action named, busy and disabled", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <SecondaryButton
        icon={ArrowClockwise}
        label="Refreshing access"
        loading
        onPress={onPress}
      />,
      { wrapper }
    );
    const action = screen.getByRole("button", {
      name: "Refreshing access"
    });

    expect(action.props.accessibilityState).toEqual({
      busy: true,
      disabled: true
    });
    fireEvent.press(action);
    expect(onPress).not.toHaveBeenCalled();
  });
});
