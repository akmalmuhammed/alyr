jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(
    ({ native }: { readonly native: string }) => native
  )
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn()
}));

import { platformAuthProviderOptions as androidProviderOptions } from "@/auth/platformAuthProviderOptions.android";
import { platformAuthProviderOptions as iosProviderOptions } from "@/auth/platformAuthProviderOptions.ios";
import { platformAuthProviderOptions as fallbackProviderOptions } from "@/auth/platformAuthProviderOptions";

describe("signed platform auth-provider options", () => {
  it("configures the reviewed browser provider only on Android", () => {
    const android = androidProviderOptions();

    expect(android.googleOAuth?.redirectTo).toBe("heldat://callback");
    expect(android.googleOAuth?.browser.open).toEqual(expect.any(Function));
  });

  it("omits the third-party provider on iOS and fallback platforms", () => {
    expect(iosProviderOptions()).toEqual({});
    expect(fallbackProviderOptions()).toEqual({});
  });
});
