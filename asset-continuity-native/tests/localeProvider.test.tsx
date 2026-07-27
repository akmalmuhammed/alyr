import {
  act,
  renderHook,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import {
  LocaleProvider,
  type LocalePreferenceStore,
  useLocale
} from "@/i18n/LocaleProvider";

describe("independent locale preference", () => {
  it("hydrates Arabic without a workspace or signed session", async () => {
    const store: LocalePreferenceStore = {
      load: jest.fn(async () => "ar"),
      save: jest.fn(async () => undefined)
    };
    const wrapper = ({ children }: PropsWithChildren) => (
      <LocaleProvider store={store}>{children}</LocaleProvider>
    );
    const hook = await renderHook(() => useLocale(), { wrapper });

    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current).toMatchObject({
      language: "ar",
      locale: "ar-QA",
      rtl: true
    });
  });

  it("applies a selection immediately and persists it", async () => {
    const store: LocalePreferenceStore = {
      load: jest.fn(async () => null),
      save: jest.fn(async () => undefined)
    };
    const wrapper = ({ children }: PropsWithChildren) => (
      <LocaleProvider initialLanguage="en" store={store}>
        {children}
      </LocaleProvider>
    );
    const hook = await renderHook(() => useLocale(), { wrapper });

    await act(async () => {
      await hook.result.current.setLanguage("ar");
    });

    expect(hook.result.current.language).toBe("ar");
    expect(hook.result.current.rtl).toBe(true);
    expect(store.save).toHaveBeenCalledWith("ar");
  });

  it("does not block startup when preference storage is unavailable", async () => {
    const store: LocalePreferenceStore = {
      load: jest.fn(async () => {
        throw new Error("secure storage unavailable");
      }),
      save: jest.fn(async () => undefined)
    };
    const wrapper = ({ children }: PropsWithChildren) => (
      <LocaleProvider store={store}>{children}</LocaleProvider>
    );
    const hook = await renderHook(() => useLocale(), { wrapper });

    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current).toMatchObject({
      language: "en",
      locale: "en-QA",
      rtl: false
    });
  });
});
