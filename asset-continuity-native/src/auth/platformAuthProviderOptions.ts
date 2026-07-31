import type { SupabaseAuthAdapterOptions } from "./adapters/supabase";

export type PlatformAuthProviderOptions = Pick<
  SupabaseAuthAdapterOptions,
  "googleOAuth"
>;

/**
 * Fail-closed fallback for web and any platform without an explicit provider
 * policy. Metro replaces this module with the platform-specific implementation
 * for signed Android and iOS builds.
 */
export function platformAuthProviderOptions(): PlatformAuthProviderOptions {
  return {};
}
