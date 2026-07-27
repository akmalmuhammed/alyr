import { createPreviewAuthGateway } from "@/auth/adapters/preview";

function createGateway() {
  let id = 0;
  return createPreviewAuthGateway({
    createId: () => `preview-account-${++id}`,
    digest: async (value) => `digest:${value}`,
    now: () => new Date("2026-07-27T10:00:00.000Z")
  });
}

describe("preview auth gateway", () => {
  it("states truthfully that no email was sent and creates no session yet", async () => {
    const gateway = createGateway();
    const result = await gateway.signUp({
      email: " OWNER@EXAMPLE.COM ",
      password: "correct horse battery staple"
    });

    expect(result).toEqual({
      ok: true,
      value: {
        kind: "preview-ready",
        identity: {
          id: "preview-account-1",
          email: "owner@example.com",
          emailVerified: false
        },
        confirmation: {
          destination: "owner@example.com",
          requestedAt: "2026-07-27T10:00:00.000Z",
          delivery: "none"
        }
      }
    });
    await expect(gateway.currentSession()).resolves.toEqual({
      ok: true,
      value: null
    });
    await expect(gateway.currentAccessToken()).resolves.toEqual({
      ok: true,
      value: null
    });
  });

  it("requires an explicit test-session action and never marks email verified", async () => {
    const gateway = createGateway();
    await gateway.signUp({
      email: "owner@example.com",
      password: "correct horse battery staple"
    });

    const result = await gateway.beginPreviewSession("owner@example.com");
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        assurance: "preview",
        expiresAt: null,
        identity: expect.objectContaining({
          emailVerified: false
        }),
        onboarding: "required"
      })
    });
    await expect(gateway.currentSession()).resolves.toEqual(result);
  });

  it("accepts only an account created in the same running session", async () => {
    const gateway = createGateway();
    await expect(
      gateway.signIn({
        email: "missing@example.com",
        password: "correct horse battery staple"
      })
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_credentials" })
    });

    await gateway.signUp({
      email: "owner@example.com",
      password: "correct horse battery staple"
    });
    await expect(
      gateway.signIn({
        email: "owner@example.com",
        password: "wrong password"
      })
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_credentials" })
    });
  });

  it("prevents duplicate preview identities and clears the active session", async () => {
    const gateway = createGateway();
    const credentials = {
      email: "owner@example.com",
      password: "correct horse battery staple"
    };
    await gateway.signUp(credentials);
    await gateway.beginPreviewSession(credentials.email);

    await expect(gateway.signUp(credentials)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "account_exists" })
    });
    await gateway.signOut();
    await expect(gateway.currentSession()).resolves.toEqual({
      ok: true,
      value: null
    });
  });

  it("updates a preview password only after a local recovery request", async () => {
    const gateway = createGateway();
    await gateway.signUp({
      email: "owner@example.com",
      password: "correct horse battery staple"
    });

    await expect(
      gateway.requestPasswordRecovery(" OWNER@EXAMPLE.COM ")
    ).resolves.toEqual({
      ok: true,
      value: {
        destination: "owner@example.com",
        requestedAt: "2026-07-27T10:00:00.000Z",
        delivery: "none"
      }
    });
    await expect(
      gateway.updatePassword("a new private password")
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(
      gateway.signIn({
        email: "owner@example.com",
        password: "correct horse battery staple"
      })
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_credentials" })
    });
    await expect(
      gateway.signIn({
        email: "owner@example.com",
        password: "a new private password"
      })
    ).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({ kind: "preview-ready" })
    });
  });
});
