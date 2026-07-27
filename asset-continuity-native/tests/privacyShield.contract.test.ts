import { render } from "@testing-library/react-native";
import { createElement } from "react";
import { StyleSheet } from "react-native";

import {
  PRIVACY_SHIELD_COPY,
  PrivacyShield
} from "@/components/PrivacyShield";
import { LocaleProvider } from "@/i18n/LocaleProvider";

describe("inactive-app privacy accessibility contract", () => {
  it("hides the record tree and exposes one modal privacy shield", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const layout = readFileSync(
      `${process.cwd()}/app/_layout.tsx`,
      "utf8"
    );
    const shield = readFileSync(
      `${process.cwd()}/src/components/PrivacyShield.tsx`,
      "utf8"
    );

    expect(layout).toContain('"aria-hidden": privacyShielded');
    expect(layout).toContain(
      "accessibilityElementsHidden: privacyShielded"
    );
    expect(layout).toContain(
      'privacyShielded\n            ? ("no-hide-descendants" as const)\n            : ("auto" as const)'
    );
    expect(shield).toContain("accessibilityViewIsModal");
    expect(shield).toContain(
      "accessibilityLabel={copy.accessibilityLabel}"
    );
  });

  it("provides Arabic lock-screen copy without changing the English contract", () => {
    expect(PRIVACY_SHIELD_COPY.en.accessibilityLabel).toBe(
      "ALYR is locked while the app is not active"
    );
    expect(PRIVACY_SHIELD_COPY.en.message).toBe(
      "Private while you are away"
    );
    expect(PRIVACY_SHIELD_COPY.ar.accessibilityLabel).toMatch(
      /[\u0600-\u06ff]/u
    );
    expect(PRIVACY_SHIELD_COPY.ar.message).toBe(
      "خصوصيتك محفوظة أثناء ابتعادك"
    );
  });

  it("renders the inactive-app shield in Arabic with RTL typography", async () => {
    const screen = await render(
      createElement(
        LocaleProvider,
        { initialLanguage: "ar" },
        createElement(PrivacyShield, { visible: true })
      )
    );
    const message = screen.getByText("خصوصيتك محفوظة أثناء ابتعادك");
    const style = StyleSheet.flatten(message.props.style);

    expect(
      screen.getByLabelText("تطبيق ALYR مقفل أثناء عدم استخدامه")
    ).toBeTruthy();
    expect(style.fontFamily).toBe("IBMPlexSansArabic_400Regular");
    expect(style.writingDirection).toBe("rtl");
  });
});
