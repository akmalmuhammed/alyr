import { render } from "@testing-library/react-native";
import { createRef, type PropsWithChildren } from "react";
import { StyleSheet, type View } from "react-native";

import { CaptureHeader } from "../app/capture/index";
import {
  CAPTURE_COPY,
  getCaptureCopy,
  localizedCategoryLabel
} from "@/i18n/captureCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

jest.mock("@/components/PlacePinEditor", () => ({
  PlacePinEditor: () => null
}));

function arabicWrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider initialLanguage="ar">
      {children}
    </LocaleProvider>
  );
}

describe("Quick Passport Arabic contract", () => {
  it("keeps the four steps, recovery messages and review labels complete", () => {
    expect(CAPTURE_COPY.en.steps).toHaveLength(4);
    expect(CAPTURE_COPY.ar.steps).toEqual([
      "التفاصيل",
      "الموقع",
      "الإثبات",
      "المراجعة"
    ]);
    expect(getCaptureCopy("ar")).toMatchObject({
      nameError: expect.stringContaining("الغرض"),
      locationError: expect.stringContaining("موقع"),
      savePassport: "حفظ الجواز",
      reviewLocation: "الموقع",
      reviewProof: "الإثبات",
      reviewSaving: "الحفظ",
      spaceKindLabels: {
        room: "غرفة",
        zone: "منطقة",
        container: "حاوية"
      }
    });
    expect(
      localizedCategoryLabel(
        "watches-jewelry",
        "Watches & jewelry",
        "ar"
      )
    ).toBe("الساعات والمجوهرات");
  });

  it("renders the actual capture header mirrored with Arabic close copy", async () => {
    const screen = await render(
      <CaptureHeader
        label="جواز سريع"
        onClose={() => undefined}
        progress={50}
        stepAnnouncementRef={createRef<View>()}
        stepLabel="٢ / ٤ · الموقع"
      />,
      { wrapper: arabicWrapper }
    );
    const headingStyle = StyleSheet.flatten(
      screen.getByText("٢ / ٤ · الموقع").props.style
    );

    expect(screen.getByLabelText("إغلاق التسجيل")).toBeTruthy();
    expect(headingStyle.writingDirection).toBe("rtl");
    expect(headingStyle.textAlign).toBe("right");
  });

  it("has no remaining English capture UI literals outside the copy contract", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/capture/index.tsx`,
      "utf8"
    );

    expect(source).toContain("getCaptureCopy(language)");
    expect(source).toContain("captureCopy.savePassport");
    expect(source).toContain("captureCopy.locationError");
    expect(source).not.toContain('"Review your Passport"');
    expect(source).not.toContain('"Save Passport"');
    expect(source).not.toContain('"Choose what you know about the item');
  });
});
