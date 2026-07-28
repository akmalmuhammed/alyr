import {
  render,
  waitFor
} from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

import {
  resolveFontStartupState,
  StartupStatus
} from "@/components/StartupStatus";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { STARTUP_COPY } from "@/i18n/startupCopy";

describe("localized startup status", () => {
  const originalPlatform = Platform.OS;
  let announce: jest.SpyInstance;

  beforeEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios"
    });
    announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    announce.mockRestore();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform
    });
  });

  it("wires the accessible status into root and tab startup branches", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const rootLayout = readFileSync(
      `${process.cwd()}/app/_layout.tsx`,
      "utf8"
    );
    const tabsLayout = readFileSync(
      `${process.cwd()}/app/(tabs)/_layout.tsx`,
      "utf8"
    );

    expect(rootLayout).toContain('kind="application"');
    expect(rootLayout).toContain(
      'testID="root-font-startup-status"'
    );
    expect(rootLayout).toContain(
      'testID="root-locale-startup-status"'
    );
    expect(rootLayout).toContain("instrumentError");
    expect(rootLayout).toContain("arabicError");
    expect(rootLayout).toContain(
      'fontStartupState !== "loading"'
    );
    expect(rootLayout).toContain(
      'testID="font-fallback-recovery"'
    );
    expect(rootLayout).toContain(
      'testID="font-fallback-continue"'
    );
    expect(tabsLayout).toContain('kind="workspace"');
    expect(tabsLayout).toContain('testID="tabs-startup-status"');
  });

  it("resolves loading, ready and recoverable font failure states", () => {
    expect(
      resolveFontStartupState({
        arabicError: null,
        arabicLoaded: false,
        instrumentError: null,
        instrumentLoaded: false,
        monoError: null,
        monoLoaded: false
      })
    ).toBe("loading");
    expect(
      resolveFontStartupState({
        arabicError: null,
        arabicLoaded: true,
        instrumentError: null,
        instrumentLoaded: true,
        monoError: null,
        monoLoaded: true
      })
    ).toBe("ready");
    expect(
      resolveFontStartupState({
        arabicError: new Error("font failed"),
        arabicLoaded: false,
        instrumentError: null,
        instrumentLoaded: true,
        monoError: null,
        monoLoaded: true
      })
    ).toBe("fallback");
    expect(
      resolveFontStartupState({
        arabicError: null,
        arabicLoaded: true,
        instrumentError: null,
        instrumentLoaded: true,
        monoError: new Error("metadata font failed"),
        monoLoaded: false
      })
    ).toBe("fallback");
  });

  it("names and announces the English root startup state", async () => {
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <StartupStatus
          kind="application"
          testID="root-startup"
        />
      </LocaleProvider>
    );
    const status = screen.getByTestId("root-startup");

    expect(status.props.accessibilityLabel).toBe(
      STARTUP_COPY.en.application
    );
    expect(STARTUP_COPY.en.application).toBe("Starting ALYR");
    expect(status.props.accessibilityRole).toBe("progressbar");
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(status.props.accessibilityState).toEqual({ busy: true });
    expect(
      screen.getByText(STARTUP_COPY.en.application)
    ).toBeTruthy();
    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(
        STARTUP_COPY.en.application
      );
    });
  });

  it("names and announces the Arabic tab-workspace startup state", async () => {
    const screen = await render(
      <LocaleProvider initialLanguage="ar">
        <StartupStatus kind="workspace" testID="tabs-startup" />
      </LocaleProvider>
    );
    const status = screen.getByTestId("tabs-startup");

    expect(status.props.accessibilityLabel).toBe(
      STARTUP_COPY.ar.workspace
    );
    expect(STARTUP_COPY.ar.workspace).toBe(
      "جارٍ تجهيز مساحتك الخاصة"
    );
    expect(status.props.accessibilityRole).toBe("progressbar");
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(status.props.accessibilityState).toEqual({ busy: true });
    expect(
      screen.getByText(STARTUP_COPY.ar.workspace)
    ).toBeTruthy();
    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(
        STARTUP_COPY.ar.workspace
      );
    });
  });
});
