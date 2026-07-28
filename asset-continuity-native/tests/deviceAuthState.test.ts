import {
  DEFAULT_VAULT_RELOCK_TIMEOUT_MS,
  initialVaultLockState,
  reduceVaultLockState,
  type VaultLockState
} from "@/deviceAuth/state";

const available = {
  kind: "available",
  method: "face",
  biometricEnrolled: true
} as const;

function unlockedState(): VaultLockState {
  let state = reduceVaultLockState(initialVaultLockState, {
    type: "PROTECT"
  });
  state = reduceVaultLockState(state, {
    type: "CAPABILITY_RESOLVED",
    capability: available
  });
  state = reduceVaultLockState(state, {
    type: "UNLOCK_REQUESTED"
  });
  return reduceVaultLockState(state, { type: "AUTH_SUCCEEDED" });
}

describe("signed workspace device-auth state machine", () => {
  it("accepts one verified onboarding grant without entering a lock state", () => {
    expect(
      reduceVaultLockState(initialVaultLockState, {
        type: "PROTECT_AUTHORIZED",
        capability: available
      })
    ).toEqual({
      phase: "unlocked",
      capability: available,
      backgroundedAt: null,
      notice: null
    });
  });

  it("keeps a short background visit unlocked and re-locks at the timeout", () => {
    const startedAt = 10_000;
    const backgrounded = reduceVaultLockState(unlockedState(), {
      type: "APP_BACKGROUNDED",
      at: startedAt
    });

    expect(
      reduceVaultLockState(backgrounded, {
        type: "APP_BECAME_ACTIVE",
        at:
          startedAt +
          DEFAULT_VAULT_RELOCK_TIMEOUT_MS -
          1,
        timeoutMs: DEFAULT_VAULT_RELOCK_TIMEOUT_MS
      })
    ).toMatchObject({
      phase: "unlocked",
      backgroundedAt: null
    });

    expect(
      reduceVaultLockState(backgrounded, {
        type: "APP_BECAME_ACTIVE",
        at: startedAt + DEFAULT_VAULT_RELOCK_TIMEOUT_MS,
        timeoutMs: DEFAULT_VAULT_RELOCK_TIMEOUT_MS
      })
    ).toMatchObject({
      phase: "locked",
      backgroundedAt: null,
      notice: "timed-out"
    });
  });

  it("can close the vault while the process remains backgrounded", () => {
    const backgrounded = reduceVaultLockState(unlockedState(), {
      type: "APP_BACKGROUNDED",
      at: 1_000
    });
    expect(
      reduceVaultLockState(backgrounded, {
        type: "BACKGROUND_TIMEOUT_REACHED",
        at: 121_000,
        timeoutMs: 120_000
      })
    ).toMatchObject({
      phase: "locked",
      notice: "timed-out"
    });
  });

  it("never releases the vault after cancellation or missing device protection", () => {
    let state = reduceVaultLockState(initialVaultLockState, {
      type: "PROTECT"
    });
    state = reduceVaultLockState(state, {
      type: "CAPABILITY_RESOLVED",
      capability: available
    });
    state = reduceVaultLockState(state, {
      type: "UNLOCK_REQUESTED"
    });
    state = reduceVaultLockState(state, {
      type: "AUTH_FAILED",
      error: "user_cancel"
    });
    expect(state).toMatchObject({
      phase: "locked",
      notice: "cancelled"
    });

    state = reduceVaultLockState(state, {
      type: "UNLOCK_REQUESTED"
    });
    state = reduceVaultLockState(state, {
      type: "AUTH_FAILED",
      error: "passcode_not_set"
    });
    expect(state).toMatchObject({
      phase: "unavailable",
      capability: {
        kind: "unavailable",
        reason: "passcode-not-set"
      }
    });
  });

  it("supports an explicit immediate lock", () => {
    expect(
      reduceVaultLockState(unlockedState(), { type: "LOCK_NOW" })
    ).toMatchObject({
      phase: "locked",
      notice: "manually-locked"
    });
  });
});
