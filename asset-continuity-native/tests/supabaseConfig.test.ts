import { decideSignedSupabaseRuntime } from "@/runtime/supabaseConfig";

function legacyJwt(role: string): string {
  const payload = globalThis
    .btoa(JSON.stringify({ role }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  return `header.${payload}.signature`;
}

describe("signed Supabase public configuration", () => {
  it("derives the Edge Function API from a current publishable key", () => {
    expect(
      decideSignedSupabaseRuntime("native-secure", {
        supabaseUrl: "https://project-ref.supabase.co/",
        supabasePublishableKey: `sb_publishable_${"a".repeat(24)}`
      })
    ).toEqual({
      kind: "configure",
      configuration: {
        projectUrl: "https://project-ref.supabase.co",
        publishableKey: `sb_publishable_${"a".repeat(24)}`,
        apiBaseUrl:
          "https://project-ref.supabase.co/functions/v1/api",
        pilotAccessEndpoint:
          "https://project-ref.supabase.co/functions/v1/api/pilot/preflight",
        householdInviteAccessEndpoint:
          "https://project-ref.supabase.co/functions/v1/api/invites/preflight",
        emailRedirectTo: "heldat://callback",
        passwordRecoveryRedirectTo: "heldat://reset-password"
      }
    });
  });

  it("accepts only an anon-role JWT for a legacy public key", () => {
    expect(
      decideSignedSupabaseRuntime("native-secure", {
        supabaseUrl: "https://project-ref.supabase.co",
        supabaseAnonKey: legacyJwt("anon")
      }).kind
    ).toBe("configure");
    expect(
      decideSignedSupabaseRuntime("native-secure", {
        supabaseUrl: "https://project-ref.supabase.co",
        supabaseAnonKey: legacyJwt("service_role")
      })
    ).toEqual({ kind: "unavailable", reason: "invalid-environment" });
  });

  it.each([
    {
      environment: {
        supabaseUrl: "http://project-ref.supabase.co",
        supabasePublishableKey: `sb_publishable_${"a".repeat(24)}`
      },
      reason: "invalid-environment"
    },
    {
      environment: {
        supabaseUrl: "https://project-ref.supabase.co",
        supabasePublishableKey: `sb_secret_${"a".repeat(24)}`
      },
      reason: "invalid-environment"
    },
    {
      environment: {
        supabaseUrl: "https://project-ref.supabase.co"
      },
      reason: "missing-environment"
    }
  ] as const)("fails closed for unsafe or missing signed config", ({
    environment,
    reason
  }) => {
    expect(
      decideSignedSupabaseRuntime("native-secure", environment)
    ).toEqual({ kind: "unavailable", reason });
  });

  it("does not instantiate a provider client in preview and test profiles", () => {
    expect(decideSignedSupabaseRuntime("expo-go-preview", {})).toEqual({
      kind: "skip-preview"
    });
    expect(decideSignedSupabaseRuntime("web-preview", {})).toEqual({
      kind: "skip-preview"
    });
    expect(decideSignedSupabaseRuntime("test", {})).toEqual({
      kind: "skip-preview"
    });
  });
});
