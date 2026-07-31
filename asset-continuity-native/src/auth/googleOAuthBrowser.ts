import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

import type {
  OAuthSessionPort,
  OAuthSessionResult
} from "./adapters/supabase";

export const HELDAT_GOOGLE_OAUTH_NATIVE_REDIRECT =
  "heldat://callback" as const;

WebBrowser.maybeCompleteAuthSession();

/**
 * Resolves the checked native callback through Expo AuthSession rather than
 * hand-assembling a runtime URL. Signed native builds must keep the app-owned
 * scheme; a proxy or development URL is never accepted here.
 */
export function heldatGoogleOAuthRedirectUri(): string {
  const redirectTo = makeRedirectUri({
    native: HELDAT_GOOGLE_OAUTH_NATIVE_REDIRECT
  });
  if (redirectTo !== HELDAT_GOOGLE_OAUTH_NATIVE_REDIRECT) {
    throw new Error(
      "Heldat Google OAuth requires the signed native callback."
    );
  }
  return redirectTo;
}

export function createExpoGoogleOAuthBrowser(): OAuthSessionPort {
  return {
    async open(
      authorizationUrl: string,
      redirectTo: string
    ): Promise<OAuthSessionResult> {
      const result = await WebBrowser.openAuthSessionAsync(
        authorizationUrl,
        redirectTo,
        {
          preferEphemeralSession: false,
          showInRecents: false
        }
      );
      if (result.type === "success") {
        return { type: "success", url: result.url };
      }
      return { type: result.type };
    }
  };
}
