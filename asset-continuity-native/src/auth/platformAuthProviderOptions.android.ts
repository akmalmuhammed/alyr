import type { SupabaseAuthAdapterOptions } from "./adapters/supabase";
import {
  createExpoGoogleOAuthBrowser,
  heldatGoogleOAuthRedirectUri
} from "./googleOAuthBrowser";

type PlatformAuthProviderOptions = Pick<
  SupabaseAuthAdapterOptions,
  "googleOAuth"
>;

export function platformAuthProviderOptions(): PlatformAuthProviderOptions {
  return {
    googleOAuth: {
      redirectTo: heldatGoogleOAuthRedirectUri(),
      browser: createExpoGoogleOAuthBrowser()
    }
  };
}
