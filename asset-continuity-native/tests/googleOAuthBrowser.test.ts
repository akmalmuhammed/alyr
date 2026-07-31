jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(
    ({ native }: { readonly native: string }) => native
  )
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(async () => ({
    type: "success" as const,
    url: "heldat://callback?code=pkce-google-code-02"
  }))
}));

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

import {
  createExpoGoogleOAuthBrowser,
  heldatGoogleOAuthRedirectUri
} from "@/auth/googleOAuthBrowser";

describe("Expo Google OAuth browser", () => {
  it("uses the signed callback and operating-system authentication session", async () => {
    expect(heldatGoogleOAuthRedirectUri()).toBe("heldat://callback");
    expect(AuthSession.makeRedirectUri).toHaveBeenCalledWith({
      native: "heldat://callback"
    });
    await expect(
      createExpoGoogleOAuthBrowser().open(
        "https://project-ref.supabase.co/auth/v1/authorize?provider=google",
        "heldat://callback"
      )
    ).resolves.toEqual({
      type: "success",
      url: "heldat://callback?code=pkce-google-code-02"
    });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      "https://project-ref.supabase.co/auth/v1/authorize?provider=google",
      "heldat://callback",
      {
        preferEphemeralSession: false,
        showInRecents: false
      }
    );
    expect(WebBrowser.maybeCompleteAuthSession).toHaveBeenCalledTimes(1);
  });
});
