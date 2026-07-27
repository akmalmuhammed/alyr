import {
  createSupabaseAuthGateway,
  type SupabaseAuthClientLike
} from "@/auth/adapters/supabase";

function user(
  verified: boolean,
  metadata: Readonly<Record<string, unknown>> = {},
  appMetadata: Readonly<Record<string, unknown>> = {}
) {
  return {
    id: "account-1",
    email: "owner@example.com",
    email_confirmed_at: verified ? "2026-07-27T10:00:00.000Z" : null,
    user_metadata: metadata,
    app_metadata: appMetadata
  };
}

function clientWith(
  overrides: Partial<SupabaseAuthClientLike["auth"]> = {}
): SupabaseAuthClientLike {
  return {
    auth: {
      signUp: jest.fn(async () => ({
        data: { user: user(false), session: null },
        error: null
      })),
      signInWithPassword: jest.fn(async () => ({
        data: {
          user: user(true),
          session: { user: user(true), expires_at: 1_800_000_000 }
        },
        error: null
      })),
      resend: jest.fn(async () => ({ data: {}, error: null })),
      resetPasswordForEmail: jest.fn(async () => ({
        data: {},
        error: null
      })),
      updateUser: jest.fn(async () => ({
        data: { user: user(true) },
        error: null
      })),
      getSession: jest.fn(async () => ({
        data: { session: null },
        error: null
      })),
      refreshSession: jest.fn(async () => ({
        data: { user: null, session: null },
        error: null
      })),
      onAuthStateChange: jest.fn(() => ({
        data: {
          subscription: {
            unsubscribe: jest.fn()
          }
        }
      })),
      exchangeCodeForSession: jest.fn(async () => ({
        data: {
          user: user(true),
          session: { user: user(true), expires_at: 1_800_000_000 }
        },
        error: null
      })),
      signOut: jest.fn(async () => ({ data: {}, error: null })),
      ...overrides
    }
  };
}

const pilotPreflightFetch = jest.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    apiVersion: 1,
    enrollmentGrant: "a".repeat(64),
    expiresAt: "2026-07-27T10:10:00.000Z"
  })
})) as unknown as typeof fetch;

const options = {
  emailRedirectTo: "alyr://callback",
  pilotAccessEndpoint:
    "https://project-ref.supabase.co/functions/v1/api/pilot/preflight",
  householdInviteAccessEndpoint:
    "https://project-ref.supabase.co/functions/v1/api/invites/preflight",
  publicApiKey: `sb_publishable_${"a".repeat(24)}`,
  fetchImpl: pilotPreflightFetch,
  passwordRecoveryRedirectTo: "alyr://reset-password",
  now: () => new Date("2026-07-27T10:00:00.000Z")
};

type ProviderListener = Parameters<
  SupabaseAuthClientLike["auth"]["onAuthStateChange"]
>[0];

describe("Supabase auth adapter contract", () => {
  it("distinguishes accepted confirmation request from a verified session", async () => {
    const client = clientWith();
    const gateway = createSupabaseAuthGateway(client, options);

    const result = await gateway.signUp({
      email: " OWNER@EXAMPLE.COM ",
      password: "correct horse battery staple",
      pilotAccessCode: "ALYR-AAAA-BBBB-CCCC"
    });

    expect(result).toEqual({
      ok: true,
      value: {
        kind: "confirmation-required",
        identity: {
          id: "account-1",
          email: "owner@example.com",
          emailVerified: false
        },
        confirmation: {
          destination: "owner@example.com",
          requestedAt: "2026-07-27T10:00:00.000Z",
          delivery: "requested"
        }
      }
    });
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "correct horse battery staple",
      options: {
        data: {
          alyr_signup_channel: "mobile-pilot-v1",
          pilot_signup_grant: "a".repeat(64)
        },
        emailRedirectTo: "alyr://callback"
      }
    });
    expect(pilotPreflightFetch).toHaveBeenCalledWith(
      options.pilotAccessEndpoint,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          apiVersion: 1,
          email: "owner@example.com",
          accessCode: "ALYRAAAABBBBCCCC"
        })
      })
    );
  });

  it("does not call Supabase signup before a pilot credential is present", async () => {
    const client = clientWith();
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const gateway = createSupabaseAuthGateway(client, {
      ...options,
      fetchImpl
    });

    await expect(
      gateway.signUp({
        email: "owner@example.com",
        password: "correct horse battery staple"
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "pilot_access_required",
        message: "Enter the pilot access code from your invitation.",
        retryable: false
      }
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("uses an email-bound household invitation grant without an operator pilot code", async () => {
    const client = clientWith();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        apiVersion: 1,
        enrollmentGrant: "b".repeat(64),
        expiresAt: "2026-07-27T10:10:00.000Z"
      })
    })) as unknown as typeof fetch;
    const gateway = createSupabaseAuthGateway(client, {
      ...options,
      fetchImpl
    });

    await expect(
      gateway.signUp({
        email: " RECIPIENT@EXAMPLE.COM ",
        password: "correct horse battery staple",
        householdInviteCode: "  invite-code-01  "
      })
    ).resolves.toMatchObject({
      ok: true,
      value: { kind: "confirmation-required" }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      options.householdInviteAccessEndpoint,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          apiVersion: 1,
          email: "recipient@example.com",
          oneTimeCode: "INVITE-CODE-01"
        })
      })
    );
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "recipient@example.com",
        options: expect.objectContaining({
          data: {
            alyr_signup_channel: "mobile-pilot-v1",
            pilot_signup_grant: "b".repeat(64)
          }
        })
      })
    );
  });

  it("fails closed on an invalid household invitation before identity creation", async () => {
    const client = clientWith();
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: { code: "AUTHORIZATION_DENIED" }
      })
    })) as unknown as typeof fetch;
    const gateway = createSupabaseAuthGateway(client, {
      ...options,
      fetchImpl
    });

    await expect(
      gateway.signUp({
        email: "recipient@example.com",
        password: "correct horse battery staple",
        householdInviteCode: "EXPIRED-INVITE"
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "pilot_access_denied",
        retryable: false
      }
    });
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("fails closed when the pilot credential is denied", async () => {
    const client = clientWith();
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: "AUTHORIZATION_DENIED"
        }
      })
    })) as unknown as typeof fetch;
    const gateway = createSupabaseAuthGateway(client, {
      ...options,
      fetchImpl
    });

    await expect(
      gateway.signUp({
        email: "owner@example.com",
        password: "correct horse battery staple",
        pilotAccessCode: "ALYR-AAAA-BBBB-CCCC"
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "pilot_access_denied",
        retryable: false
      }
    });
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("fails closed when pilot preflight is offline", async () => {
    const client = clientWith();
    const fetchImpl = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const gateway = createSupabaseAuthGateway(client, {
      ...options,
      fetchImpl
    });

    await expect(
      gateway.signUp({
        email: "owner@example.com",
        password: "correct horse battery staple",
        pilotAccessCode: "ALYR-AAAA-BBBB-CCCC"
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "network_unavailable",
        retryable: true
      }
    });
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("rejects a malformed pilot acknowledgement before Supabase signup", async () => {
    const client = clientWith();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        apiVersion: 1,
        enrollmentGrant: "not-a-server-grant",
        expiresAt: "2026-07-27T10:10:00.000Z"
      })
    })) as unknown as typeof fetch;
    const gateway = createSupabaseAuthGateway(client, {
      ...options,
      fetchImpl
    });

    await expect(
      gateway.signUp({
        email: "owner@example.com",
        password: "correct horse battery staple",
        pilotAccessCode: "ALYR-AAAA-BBBB-CCCC"
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "unexpected",
        retryable: true
      }
    });
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("returns authenticated only for a provider-verified email session", async () => {
    const gateway = createSupabaseAuthGateway(clientWith(), options);
    const result = await gateway.signIn({
      email: "owner@example.com",
      password: "correct horse battery staple"
    });

    expect(result).toEqual({
      ok: true,
      value: {
        kind: "authenticated",
        session: expect.objectContaining({
          assurance: "verified-email",
          identity: expect.objectContaining({ emailVerified: true }),
          onboarding: "required"
        })
      }
    });
  });

  it("exchanges a PKCE confirmation code before exposing a session", async () => {
    const client = clientWith();
    const gateway = createSupabaseAuthGateway(client, options);
    const result = await gateway.exchangeConfirmationCode("pkce-code");

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        assurance: "verified-email"
      })
    });
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "pkce-code"
    );
  });

  it("requires a PASSWORD_RECOVERY event and consumes its grant exactly once", async () => {
    const listeners = new Set<ProviderListener>();
    const recoverySession = {
      user: user(true),
      expires_at: 1_800_000_000
    };
    const client = clientWith({
      onAuthStateChange: jest.fn((listener) => {
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => listeners.delete(listener)
            }
          }
        };
      }),
      exchangeCodeForSession: jest.fn(async () => {
        listeners.forEach((listener) =>
          listener("PASSWORD_RECOVERY", recoverySession)
        );
        return {
          data: {
            user: recoverySession.user,
            session: recoverySession
          },
          error: null
        };
      })
    });
    const gateway = createSupabaseAuthGateway(client, options);

    await expect(
      gateway.requestPasswordRecovery(" OWNER@EXAMPLE.COM ")
    ).resolves.toEqual({
      ok: true,
      value: {
        destination: "owner@example.com",
        requestedAt: "2026-07-27T10:00:00.000Z",
        delivery: "requested"
      }
    });
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "owner@example.com",
      { redirectTo: "alyr://reset-password" }
    );

    await expect(
      gateway.updatePassword("must not be accepted")
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });
    expect(client.auth.updateUser).not.toHaveBeenCalled();

    await expect(
      gateway.exchangePasswordRecoveryCode("recovery-pkce-code")
    ).resolves.toEqual({
      ok: true,
      value: {
        session: expect.objectContaining({
          assurance: "verified-email"
        }),
        grant: {
          id: "password-recovery-1",
          grantedAt: "2026-07-27T10:00:00.000Z"
        }
      }
    });
    await expect(
      gateway.updatePassword("a new private password")
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: "a new private password"
    });
    await expect(
      gateway.updatePassword("a second private password")
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });
    expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it("rejects a valid session exchange that lacks PASSWORD_RECOVERY", async () => {
    const listeners = new Set<ProviderListener>();
    const providerSession = {
      user: user(true),
      expires_at: 1_800_000_000
    };
    const client = clientWith({
      onAuthStateChange: jest.fn((listener) => {
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => listeners.delete(listener)
            }
          }
        };
      }),
      exchangeCodeForSession: jest.fn(async () => {
        listeners.forEach((listener) =>
          listener("SIGNED_IN", providerSession)
        );
        return {
          data: {
            user: providerSession.user,
            session: providerSession
          },
          error: null
        };
      })
    });
    const gateway = createSupabaseAuthGateway(client, options);

    await expect(
      gateway.exchangePasswordRecoveryCode("confirmation-code")
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    await expect(
      gateway.updatePassword("must not be accepted")
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("cancels a pending recovery exchange before signing out", async () => {
    const listeners = new Set<ProviderListener>();
    const providerSession = {
      user: user(true),
      expires_at: 1_800_000_000
    };
    const exchangeControl: {
      resolve?: (
          value: Awaited<
            ReturnType<
              SupabaseAuthClientLike["auth"]["exchangeCodeForSession"]
            >
          >
        ) => void;
    } = {};
    const client = clientWith({
      onAuthStateChange: jest.fn((listener) => {
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => listeners.delete(listener)
            }
          }
        };
      }),
      exchangeCodeForSession: jest.fn(
        () =>
          new Promise((resolve) => {
            exchangeControl.resolve = resolve;
          })
      )
    });
    const gateway = createSupabaseAuthGateway(client, options);
    const exchange = gateway.exchangePasswordRecoveryCode(
      "recovery-pkce-code"
    );
    await Promise.resolve();
    const cancellation = gateway.cancelPasswordRecovery();

    listeners.forEach((listener) =>
      listener("PASSWORD_RECOVERY", providerSession)
    );
    exchangeControl.resolve?.({
      data: {
        user: providerSession.user,
        session: providerSession
      },
      error: null
    });

    await expect(exchange).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });
    await expect(cancellation).resolves.toEqual({
      ok: true,
      value: undefined
    });
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("reports recovery cancellation failure and leaves no reusable grant", async () => {
    const listeners = new Set<ProviderListener>();
    const providerSession = {
      user: user(true),
      expires_at: 1_800_000_000
    };
    const client = clientWith({
      onAuthStateChange: jest.fn((listener) => {
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => listeners.delete(listener)
            }
          }
        };
      }),
      exchangeCodeForSession: jest.fn(async () => {
        listeners.forEach((listener) =>
          listener("PASSWORD_RECOVERY", providerSession)
        );
        return {
          data: {
            user: providerSession.user,
            session: providerSession
          },
          error: null
        };
      }),
      signOut: jest.fn(async () => ({
        data: {},
        error: {
          message: "network request failed",
          status: 0
        }
      }))
    });
    const gateway = createSupabaseAuthGateway(client, options);
    await expect(
      gateway.exchangePasswordRecoveryCode("recovery-pkce-code")
    ).resolves.toMatchObject({ ok: true });

    await expect(gateway.cancelPasswordRecovery()).resolves.toEqual({
      ok: false,
      error: {
        code: "network_unavailable",
        message:
          "ALYR could not reach the account service. Check your connection.",
        retryable: true
      }
    });
    await expect(
      gateway.updatePassword("must not be accepted")
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("maps provider failures to recovery-oriented app errors", async () => {
    const client = clientWith({
      signInWithPassword: jest.fn(async () => ({
        data: { user: null, session: null },
        error: {
          message: "Invalid login credentials internal detail",
          status: 400
        }
      }))
    });
    const gateway = createSupabaseAuthGateway(client, options);

    await expect(
      gateway.signIn({
        email: "owner@example.com",
        password: "incorrect password"
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_credentials",
        message: "The email or password is not correct.",
        retryable: false
      }
    });
  });

  it("does not expose a session when an email remains unverified", async () => {
    const client = clientWith({
      getSession: jest.fn(async () => ({
        data: {
          session: { user: user(false), expires_at: 1_800_000_000 }
        },
        error: null
      }))
    });
    const gateway = createSupabaseAuthGateway(client, options);

    await expect(gateway.currentSession()).resolves.toEqual({
      ok: true,
      value: null
    });
  });

  it("restores only a valid selected household from verified provider metadata", async () => {
    const activeUser = user(
      true,
      {},
      {
        onboarding_complete: true,
        active_household_id: "household-west-bay",
        active_membership_id: "membership-west-bay",
        active_household_role: "owner"
      }
    );
    const gateway = createSupabaseAuthGateway(
      clientWith({
        getSession: jest.fn(async () => ({
          data: {
            session: {
              user: activeUser,
              expires_at: 1_800_000_000
            }
          },
          error: null
        }))
      }),
      options
    );

    await expect(gateway.currentSession()).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        onboarding: "complete",
        activeHouseholdId: "household-west-bay",
        activeMembershipId: "membership-west-bay",
        activeHouseholdRole: "owner"
      })
    });

    const malformedUser = user(
      true,
      {},
      {
        onboarding_complete: true,
        active_household_id: " household-with-leading-space"
      }
    );
    const malformedGateway = createSupabaseAuthGateway(
      clientWith({
        getSession: jest.fn(async () => ({
          data: {
            session: {
              user: malformedUser,
              expires_at: 1_800_000_000
            }
          },
          error: null
        }))
      }),
      options
    );
    await expect(malformedGateway.currentSession()).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        activeHouseholdId: null
      })
    });

    const userControlledGateway = createSupabaseAuthGateway(
      clientWith({
        getSession: jest.fn(async () => ({
          data: {
            session: {
              user: user(true, {
                onboarding_complete: true,
                active_household_id: "must-not-authorize"
              })
            }
          },
          error: null
        }))
      }),
      options
    );
    await expect(userControlledGateway.currentSession()).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        activeHouseholdId: null
      })
    });
  });

  it("refreshes provider-controlled onboarding metadata after server completion", async () => {
    const refreshedUser = user(
      true,
      {},
      {
        active_household_id: "household-west-bay",
        active_membership_id: "membership-west-bay",
        active_household_role: "owner",
        onboarding_complete: true
      }
    );
    const client = clientWith({
      refreshSession: jest.fn(async () => ({
        data: {
          user: refreshedUser,
          session: {
            user: refreshedUser,
            expires_at: 1_800_000_000
          }
        },
        error: null
      }))
    });
    const gateway = createSupabaseAuthGateway(client, options);

    await expect(gateway.refreshSession?.()).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        activeHouseholdId: "household-west-bay",
        activeMembershipId: "membership-west-bay",
        activeHouseholdRole: "owner",
        onboarding: "complete"
      })
    });
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("returns the verified user's bearer only through the transport method", async () => {
    const verifiedUser = user(true);
    const gateway = createSupabaseAuthGateway(
      clientWith({
        getSession: jest.fn(async () => ({
          data: {
            session: {
              user: verifiedUser,
              expires_at: 1_800_000_000,
              access_token: "short-lived-user-token"
            }
          },
          error: null
        }))
      }),
      options
    );

    await expect(gateway.currentAccessToken()).resolves.toEqual({
      ok: true,
      value: "short-lived-user-token"
    });
    const unverifiedUser = user(false);
    const unverifiedGateway = createSupabaseAuthGateway(
      clientWith({
        getSession: jest.fn(async () => ({
          data: {
            session: {
              user: unverifiedUser,
              access_token: "must-not-escape"
            }
          },
          error: null
        }))
      }),
      options
    );
    await expect(unverifiedGateway.currentAccessToken()).resolves.toEqual({
      ok: true,
      value: null
    });
  });

  it("maps provider session changes and unsubscribes the global listener", () => {
    let providerListener:
      | ((event: string, session: {
          user: ReturnType<typeof user>;
          expires_at?: number;
          access_token?: string;
        } | null) => void)
      | null = null;
    const unsubscribe = jest.fn();
    const client = clientWith({
      onAuthStateChange: jest.fn((listener) => {
        providerListener = listener;
        return {
          data: {
            subscription: { unsubscribe }
          }
        };
      })
    });
    const gateway = createSupabaseAuthGateway(client, options);
    const observed = jest.fn();
    const dispose = gateway.onSessionChanged(observed);

    providerListener!("SIGNED_IN", {
      user: user(
        true,
        {},
        {
          onboarding_complete: true,
          active_household_id: "household-a",
          active_membership_id: "membership-a",
          active_household_role: "editor"
        }
      )
    });
    providerListener!("SIGNED_OUT", null);

    expect(observed).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        activeHouseholdId: "household-a",
        activeMembershipId: "membership-a",
        activeHouseholdRole: "editor",
        assurance: "verified-email"
      })
    );
    expect(observed).toHaveBeenNthCalledWith(2, null);
    dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
