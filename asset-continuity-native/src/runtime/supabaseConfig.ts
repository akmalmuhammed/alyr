import type { RuntimeProfile } from "./environment";

export interface PublicSupabaseEnvironment {
  readonly supabaseUrl?: string | undefined;
  readonly supabasePublishableKey?: string | undefined;
  /** Legacy public `anon` JWT only. Service-role JWTs are rejected. */
  readonly supabaseAnonKey?: string | undefined;
}

export interface SignedSupabaseConfiguration {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly apiBaseUrl: string;
  readonly pilotAccessEndpoint: string;
  readonly householdInviteAccessEndpoint: string;
  readonly emailRedirectTo: "alyr://callback";
  readonly passwordRecoveryRedirectTo: "alyr://reset-password";
}

export type SignedRuntimeDecision =
  | { readonly kind: "skip-preview" }
  | {
      readonly kind: "unavailable";
      readonly reason: "missing-environment" | "invalid-environment";
    }
  | {
      readonly kind: "configure";
      readonly configuration: SignedSupabaseConfiguration;
    };

function decodeLegacyJwtRole(value: string): string | null {
  const parts = value.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return null;
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );
    const parsed = JSON.parse(globalThis.atob(padded)) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const role = (parsed as Record<string, unknown>).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

function isPublicClientKey(value: string): boolean {
  if (value.startsWith("sb_secret_")) return false;
  if (value.startsWith("sb_publishable_")) {
    return value.length >= "sb_publishable_".length + 16;
  }
  return decodeLegacyJwtRole(value) === "anon";
}

function normalizedProjectUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Signed builds fail closed for absent or unsafe public configuration.
 * Preview/test builds never instantiate a network client.
 */
export function decideSignedSupabaseRuntime(
  profile: RuntimeProfile,
  environment: PublicSupabaseEnvironment
): SignedRuntimeDecision {
  if (profile !== "native-secure") return { kind: "skip-preview" };

  const rawUrl = environment.supabaseUrl?.trim() ?? "";
  const explicitPublishable =
    environment.supabasePublishableKey?.trim() ?? "";
  const legacyAnon = environment.supabaseAnonKey?.trim() ?? "";
  const publicKey = explicitPublishable || legacyAnon;
  if (!rawUrl || !publicKey) {
    return { kind: "unavailable", reason: "missing-environment" };
  }

  const projectUrl = normalizedProjectUrl(rawUrl);
  if (projectUrl === null || !isPublicClientKey(publicKey)) {
    return { kind: "unavailable", reason: "invalid-environment" };
  }

  return {
    kind: "configure",
    configuration: {
      projectUrl,
      publishableKey: publicKey,
      apiBaseUrl: `${projectUrl}/functions/v1/api`,
      pilotAccessEndpoint:
        `${projectUrl}/functions/v1/api/pilot/preflight`,
      householdInviteAccessEndpoint:
        `${projectUrl}/functions/v1/api/invites/preflight`,
      emailRedirectTo: "alyr://callback",
      passwordRecoveryRedirectTo: "alyr://reset-password"
    }
  };
}
