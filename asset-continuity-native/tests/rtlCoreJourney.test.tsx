import { render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";

import { AuthHeading } from "@/auth/components";
import { BodyText, ScreenTitle } from "@/components/ui";
import {
  CORE_JOURNEY_COPY,
  formatLocalizedDate,
  formatLocalizedNumber,
  formatStep,
  itemCount,
  searchResultAnnouncement
} from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { rtlRowStyle } from "@/i18n/rtlLayout";

function arabicWrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider initialLanguage="ar">
      {children}
    </LocaleProvider>
  );
}

function keys(value: object): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) =>
      typeof child === "object" && child !== null
        ? (keys(child as object).map((nested) => `${key}.${nested}`))
        : [key]
    )
    .sort();
}

describe("Arabic RTL core journey", () => {
  it("keeps every audited English and Arabic message in parity", () => {
    expect(keys(CORE_JOURNEY_COPY.ar)).toEqual(
      keys(CORE_JOURNEY_COPY.en)
    );
    const arabic = JSON.stringify(CORE_JOURNEY_COPY.ar);
    expect(arabic).toMatch(/[\u0600-\u06ff]/u);
    expect(arabic).not.toMatch(/[ÃƒÃ‚Ã˜Ã™ï¿½\u0080-\u009f]/u);
  });

  it("formats numbers, dates, steps and announcements for Arabic", () => {
    expect(formatLocalizedNumber(27, "ar")).toMatch(/[٢۲]/u);
    expect(formatLocalizedDate("2026-07-27", "ar")).toMatch(
      /[\u0600-\u06ff]/
    );
    expect(formatStep(2, 4, "ar")).toContain("الخطوة");
    expect(itemCount(2, "ar")).toBe("غرضان");
    expect(searchResultAnnouncement(3, 1, "ar")).toContain("مكان واحد");
  });

  it("renders the compact heading with Arabic type and RTL direction", async () => {
    const screen = await render(
      <AuthHeading
        body="يبقى سجلك واضحًا عند تكبير النص."
        eyebrow="سجل خاص"
        title="اعرف مكان ما تملك."
      />,
      { wrapper: arabicWrapper }
    );
    const style = StyleSheet.flatten(
      screen.getByText("اعرف مكان ما تملك.").props.style
    );

    expect(style.fontFamily).toBe("IBMPlexSansArabic_600SemiBold");
    expect(style.writingDirection).toBe("rtl");
    expect(style.textAlign).toBe("right");
  });

  it("keeps shared title and body primitives right-aligned in Arabic", async () => {
    const screen = await render(
      <>
        <ScreenTitle>عنوان</ScreenTitle>
        <BodyText>وصف</BodyText>
      </>,
      { wrapper: arabicWrapper }
    );
    const titleStyle = StyleSheet.flatten(
      screen.getByText("عنوان").props.style
    );
    const bodyStyle = StyleSheet.flatten(
      screen.getByText("وصف").props.style
    );

    expect(titleStyle.textAlign).toBe("right");
    expect(bodyStyle.textAlign).toBe("right");
    expect(titleStyle.fontFamily).toBe(
      "IBMPlexSansArabic_600SemiBold"
    );
    expect(bodyStyle.fontFamily).toBe("IBMPlexSansArabic_400Regular");
  });

  it("mirrors RTL rows exactly once on web and native", () => {
    expect(rtlRowStyle("web")).toEqual({});
    expect(rtlRowStyle("ios")).toEqual({
      flexDirection: "row-reverse"
    });
    expect(rtlRowStyle("android")).toEqual({
      flexDirection: "row-reverse"
    });
  });
});
