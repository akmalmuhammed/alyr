import {
  createPasswordRecoverySessionMarkerStore,
  type PasswordRecoverySessionMarkerStore
} from "@/auth/passwordRecoverySessionMarker";
import { createRecoveryProtectedAuthGateway } from "@/auth/recoveryProtectedAuthGateway";
import type {
  AccountAuthGateway,
  AuthSessionDescriptor,
  PasswordRecoveryExchange
} from "@/auth/types";

const EXCHANGE_ID = "00000000-0000-4000-8000-000000000101";
const STARTED_AT = "2026-07-28T10:00:00.000Z";

const recoverySession: AuthSessionDescriptor = {
  identity: {
    id: "account-recovery",
    email: "recovery@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: "2026-07-28T11:00:00.000Z",
  onboarding: "complete",
  activeHouseholdId: "household-recovery",
  activeMembershipId: "membership-recovery",
  activeHouseholdRole: "owner"
};

const normalSession: AuthSessionDescriptor = {
  ...recoverySession,
  identity: {
    id: "account-normal",
    email: "normal@example.com",
    emailVerified: true
  },
  activeHouseholdId: "household-normal",
  activeMembershipId: "membership-normal"
};

const recoveryExchange: PasswordRecoveryExchange = {
  session: recoverySession,
  grant: {
    id: "password-recovery-1",
    grantedAt: STARTED_AT
  }
};

function markerStoreHarness(): {
  readonly store: PasswordRecoverySessionMarkerStore;
  readonly values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    store: createPasswordRecoverySessionMarkerStore({
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        values.set(key, value);
      },
      async removeItem(key) {
        values.delete(key);
      }
    })
  };
}

function baseGatewayHarness(
  initialSession: AuthSessionDescriptor | null
): {
  readonly gateway: AccountAuthGateway;
  emit(session: AuthSessionDescriptor | null): void;
  getSession(): AuthSessionDescriptor | null;
} {
  let session = initialSession;
  let sessionListener:
    | ((value: AuthSessionDescriptor | null) => void)
    | null = null;
  const success = async () => ({
    ok: true as const,
    value: undefined
  });
  const gateway: AccountAuthGateway = {
    mode: "supabase",
    currentSession: jest.fn(async () => ({
      ok: true as const,
      value: session
    })),
    refreshSession: jest.fn(async () => ({
      ok: true as const,
      value: session
    })),
    currentAccessToken: jest.fn(async () => ({
      ok: true as const,
      value: session ? "provider-access-token" : null
    })),
    onSessionChanged: jest.fn((listener) => {
      sessionListener = listener;
      listener(session);
      return () => {
        if (sessionListener === listener) sessionListener = null;
      };
    }),
    signIn: jest.fn(async () => ({
      ok: true as const,
      value: {
        kind: "authenticated" as const,
        session: normalSession
      }
    })),
    signUp: jest.fn(async () => ({
      ok: true as const,
      value: {
        kind: "authenticated" as const,
        session: normalSession
      }
    })),
    resendConfirmation: jest.fn(async () => ({
      ok: false as const,
      error: {
        code: "unsupported" as const,
        message: "Not used by this test.",
        retryable: false
      }
    })),
    requestPasswordRecovery: jest.fn(async () => ({
      ok: false as const,
      error: {
        code: "unsupported" as const,
        message: "Not used by this test.",
        retryable: false
      }
    })),
    exchangePasswordRecoveryCode: jest.fn(async () => {
      session = recoverySession;
      sessionListener?.(recoverySession);
      return {
        ok: true as const,
        value: recoveryExchange
      };
    }),
    cancelPasswordRecovery: jest.fn(async () => {
      session = null;
      sessionListener?.(null);
      return {
        ok: true as const,
        value: undefined
      };
    }),
    updatePassword: jest.fn(success),
    exchangeConfirmationCode: jest.fn(async () => ({
      ok: true as const,
      value: normalSession
    })),
    beginPreviewSession: jest.fn(async () => ({
      ok: false as const,
      error: {
        code: "unsupported" as const,
        message: "Not used by this test.",
        retryable: false
      }
    })),
    signOut: jest.fn(async () => {
      session = null;
      sessionListener?.(null);
      return {
        ok: true as const,
        value: undefined
      };
    }),
    purgeLocalSession: jest.fn(async () => {
      session = null;
      sessionListener?.(null);
    })
  };
  return {
    gateway,
    emit(value) {
      session = value;
      sessionListener?.(value);
    },
    getSession() {
      return session;
    }
  };
}

function protect(
  gateway: AccountAuthGateway,
  markerStore: PasswordRecoverySessionMarkerStore
): AccountAuthGateway {
  return createRecoveryProtectedAuthGateway(gateway, {
    markerStore,
    createExchangeId: () => EXCHANGE_ID,
    now: () => new Date(STARTED_AT)
  });
}

describe("durable password-recovery session boundary", () => {
  it("writes the protected marker before the provider exchange and binds its account", async () => {
    const { store } = markerStoreHarness();
    const base = baseGatewayHarness(null);
    const order: string[] = [];
    base.gateway.currentSession = jest.fn(async () => {
      order.push("bootstrap-audit");
      return { ok: true as const, value: null };
    });
    base.gateway.exchangePasswordRecoveryCode = jest.fn(async () => {
      order.push("provider-exchange");
      await expect(store.read()).resolves.toMatchObject({
        phase: "exchanging",
        exchangeId: EXCHANGE_ID,
        scope: { kind: "exchange", exchangeId: EXCHANGE_ID }
      });
      return { ok: true as const, value: recoveryExchange };
    });
    const gateway = protect(base.gateway, store);

    await expect(
      gateway.exchangePasswordRecoveryCode("provider-code")
    ).resolves.toEqual({ ok: true, value: recoveryExchange });
    expect(order).toEqual([
      "bootstrap-audit",
      "provider-exchange"
    ]);
    await expect(store.read()).resolves.toMatchObject({
      phase: "session-active",
      exchangeId: EXCHANGE_ID,
      scope: {
        kind: "account",
        accountId: recoverySession.identity.id
      }
    });
  });

  it("purges a matching recovery session before fresh-process routing can observe it", async () => {
    const { store } = markerStoreHarness();
    await store.begin(EXCHANGE_ID, STARTED_AT);
    await store.bindAccount(EXCHANGE_ID, recoverySession.identity.id);
    const base = baseGatewayHarness(recoverySession);
    const observed: Array<AuthSessionDescriptor | null> = [];
    const gateway = protect(base.gateway, store);
    gateway.onSessionChanged((session) => observed.push(session));

    await expect(gateway.currentSession()).resolves.toEqual({
      ok: true,
      value: null
    });

    expect(base.gateway.cancelPasswordRecovery).toHaveBeenCalledTimes(1);
    expect(observed).toEqual([]);
    expect(base.getSession()).toBeNull();
    await expect(store.read()).resolves.toBeNull();
  });

  it("cleans a recovery session after password update before reporting success", async () => {
    const { store } = markerStoreHarness();
    const base = baseGatewayHarness(null);
    const gateway = protect(base.gateway, store);
    await gateway.currentSession();
    await gateway.exchangePasswordRecoveryCode("provider-code");

    await expect(gateway.currentSession()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });
    await expect(gateway.currentAccessToken()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });
    await expect(gateway.refreshSession?.()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });

    await expect(
      gateway.updatePassword("new-private-password")
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(base.gateway.updatePassword).toHaveBeenCalledTimes(1);
    expect(base.gateway.cancelPasswordRecovery).toHaveBeenCalledTimes(1);
    expect(base.getSession()).toBeNull();
    await expect(store.read()).resolves.toBeNull();

    await expect(gateway.cancelPasswordRecovery()).resolves.toEqual({
      ok: true,
      value: undefined
    });
    expect(base.gateway.cancelPasswordRecovery).toHaveBeenCalledTimes(1);
  });

  it("cleans an interrupted exchange after a simulated process restart", async () => {
    const { store } = markerStoreHarness();
    const firstBase = baseGatewayHarness(null);
    const firstProcess = protect(firstBase.gateway, store);
    await firstProcess.currentSession();
    await firstProcess.exchangePasswordRecoveryCode("provider-code");
    await expect(store.read()).resolves.toMatchObject({
      phase: "session-active"
    });

    const restartedBase = baseGatewayHarness(recoverySession);
    const restartedProcess = protect(restartedBase.gateway, store);
    await expect(restartedProcess.currentSession()).resolves.toEqual({
      ok: true,
      value: null
    });
    expect(
      restartedBase.gateway.cancelPasswordRecovery
    ).toHaveBeenCalledTimes(1);
    await expect(store.read()).resolves.toBeNull();
  });

  it("preserves an unrelated normal session and removes only its stale subject marker", async () => {
    const { store } = markerStoreHarness();
    await store.begin(EXCHANGE_ID, STARTED_AT);
    await store.bindAccount(EXCHANGE_ID, recoverySession.identity.id);
    const base = baseGatewayHarness(normalSession);
    const gateway = protect(base.gateway, store);

    await expect(gateway.currentSession()).resolves.toEqual({
      ok: true,
      value: normalSession
    });
    expect(base.gateway.cancelPasswordRecovery).not.toHaveBeenCalled();
    expect(base.getSession()).toEqual(normalSession);
    await expect(store.read()).resolves.toBeNull();
  });

  it("keeps routing and tokens sealed when persisted-session cleanup fails", async () => {
    const { store } = markerStoreHarness();
    await store.begin(EXCHANGE_ID, STARTED_AT);
    await store.bindAccount(EXCHANGE_ID, recoverySession.identity.id);
    const base = baseGatewayHarness(recoverySession);
    base.gateway.cancelPasswordRecovery = jest.fn(async () => ({
      ok: false as const,
      error: {
        code: "network_unavailable" as const,
        message: "The provider did not confirm sign-out.",
        retryable: true
      }
    }));
    const observed: Array<AuthSessionDescriptor | null> = [];
    const gateway = protect(base.gateway, store);
    gateway.onSessionChanged((session) => observed.push(session));

    await expect(gateway.currentSession()).resolves.toMatchObject({
      ok: false,
      error: { code: "network_unavailable" }
    });
    base.emit(recoverySession);
    expect(observed).toEqual([]);
    await expect(gateway.currentAccessToken()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_missing" }
    });
    await expect(store.read()).resolves.toMatchObject({
      phase: "session-active"
    });
  });

  it("leaves a normal session and its event stream unchanged when no marker exists", async () => {
    const { store } = markerStoreHarness();
    const base = baseGatewayHarness(normalSession);
    const observed: Array<AuthSessionDescriptor | null> = [];
    const gateway = protect(base.gateway, store);
    gateway.onSessionChanged((session) => observed.push(session));

    await expect(gateway.currentSession()).resolves.toEqual({
      ok: true,
      value: normalSession
    });
    base.emit(normalSession);
    expect(observed).toEqual([normalSession]);
    await expect(gateway.currentAccessToken()).resolves.toEqual({
      ok: true,
      value: "provider-access-token"
    });
    expect(base.gateway.cancelPasswordRecovery).not.toHaveBeenCalled();
  });

  it("fails closed on an unreadable marker until explicit sign-out removes it", async () => {
    const { store, values } = markerStoreHarness();
    await store.begin(EXCHANGE_ID, STARTED_AT);
    const [storageKey] = values.keys();
    values.set(storageKey!, "{not-json");
    const base = baseGatewayHarness(normalSession);
    const gateway = protect(base.gateway, store);

    await expect(gateway.currentSession()).resolves.toMatchObject({
      ok: false,
      error: { code: "unexpected" }
    });
    expect(base.gateway.currentSession).not.toHaveBeenCalled();
    expect(values.size).toBe(1);

    await expect(gateway.signOut()).resolves.toEqual({
      ok: true,
      value: undefined
    });
    expect(values.size).toBe(0);
  });
});
