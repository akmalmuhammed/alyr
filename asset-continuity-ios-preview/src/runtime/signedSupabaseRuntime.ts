import type {
  AccountDeletionPort,
  HouseholdAccessPort
} from "@alyr/contracts";

type PreviewSignedSupabaseRuntimeInstallation =
  | { readonly kind: "skip-preview" }
  | {
      readonly kind: "configured";
      readonly services: {
        readonly cloud: {
          readonly householdAccess: HouseholdAccessPort;
          readonly accountDeletion: AccountDeletionPort;
        };
      };
    };

/**
 * Expo Go is an honest, session-only visual preview. It never initializes the
 * signed Supabase client or persists a provider bearer.
 */
export function installSignedSupabaseRuntimeFromEnvironment(): PreviewSignedSupabaseRuntimeInstallation {
  return { kind: "skip-preview" };
}
