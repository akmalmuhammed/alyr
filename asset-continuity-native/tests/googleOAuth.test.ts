import {
  createSupabaseAuthGateway,
  extractGoogleOAuthCallbackCode,
  type OAuthSessionPort,
  type SupabaseAuthClientLike
} from "@/auth/adapters/supabase";

function verifiedUser() {
  return {
    id: "account-google",
    email: "owner@example.com",
    email_confirmed_at: "2026-07-31T00:00:00.000Z",
    app_metadata: {}
  };
}

function clientWithOAuth(
  authorizationUrl: string
): SupabaseAuthClientLike {
  return {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signInWithOAuth: jest.fn(async () => ({
        data: {
          provider: "google" as const,
          url: authorizationUrl
        },
        error: null
      })),
      resend: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      getSession: jest.fn(async () => ({
        data: { session: null },
        error: null
      })),
      refreshSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: {
          subscription: { unsubscribe: jest.fn() }
        }
      })),
      exchangeCodeForSession: jest.fn(async () => ({
        data: {
          user: verifiedUser(),
          session: {
            user: verifiedUser(),
            expires_at: 1_800_000_000
          }
        },
        error: null
      })),
      signOut: jest.fn()
    } as SupabaseAuthClientLike["auth"]
  };
}

function gatewayWith(
  browser: OAuthSessionPort,
  authorizationUrl =
    "https://project-ref.supabase.co/auth/v1/authorize?provider=google"
) {
  const client = clientWithOAuth(authorizationUrl);
  return {
    client,
    gateway: createSupabaseAuthGateway(client, {
      emailRedirectTo: "heldat://callback",
      passwordRecoveryRedirectTo: "heldat://reset-password",
      pilotAccessEndpoint:
        "https://project-ref.supabase.co/functions/v1/api/pilot/preflight",
      publicApiKey: `sb_publishable_${"a".repeat(24)}`,
      googleOAuth: {
        redirectTo: "heldat://callback",
        browser
      }
    })
  };
}

describe("Google OAuth PKCE boundary", () => {
  it("opens only the project authorization endpoint and returns only a callback code", async () => {
    const browser: OAuthSessionPort = {
      open: jest.fn(async () => ({
        type: "success" as const,
        url: "heldat://callback?code=pkce-google-code-01"
      }))
    };
    const { client, gateway } = gatewayWith(browser);

    await expect(gateway.beginGoogleOAuthSignIn?.()).resolves.toEqual({
      ok: true,
      value: { code: "pkce-google-code-01" }
    });
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "heldat://callback",
        skipBrowserRedirect: true
      }
    });
    expect(browser.open).toHaveBeenCalledWith(
      "https://project-ref.supabase.co/auth/v1/authorize?provider=google",
      "heldat://callback"
    );
    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("treats a user-closed browser as a quiet cancellation", async () => {
    const { gateway } = gatewayWith({
      open: jest.fn(async () => ({ type: "cancel" as const }))
    });

    await expect(gateway.beginGoogleOAuthSignIn?.()).resolves.toEqual({
      ok: true,
      value: null
    });
  });

  it("rejects a provider URL outside the configured Supabase project", async () => {
    const browser: OAuthSessionPort = {
      open: jest.fn(async () => ({
        type: "success" as const,
        url: "heldat://callback?code=pkce-google-code-01"
      }))
    };
    const { gateway } = gatewayWith(
      browser,
      "https://attacker.example/auth/v1/authorize?provider=google"
    );

    await expect(gateway.beginGoogleOAuthSignIn?.()).resolves.toMatchObject({
      ok: false,
      error: { code: "unexpected", retryable: false }
    });
    expect(browser.open).not.toHaveBeenCalled();
  });

  it("rejects implicit-flow tokens and foreign callback destinations", () => {
    expect(
      extractGoogleOAuthCallbackCode(
        "heldat://callback#access_token=secret",
        "heldat://callback"
      )
    ).toMatchObject({
      ok: false,
      error: { code: "unexpected" }
    });
    expect(
      extractGoogleOAuthCallbackCode(
        "other-app://callback?code=pkce-google-code-01",
        "heldat://callback"
      )
    ).toMatchObject({
      ok: false,
      error: { code: "unexpected" }
    });
  });
});
