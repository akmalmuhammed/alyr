import type { AccountAuthGateway, AuthSessionDescriptor } from "@/auth/types";
import { createRuntimeAuthGateway } from "@/auth/runtime";
import {
  getRuntimeEvidenceDownloadPort,
  getRuntimeEvidenceUploadPort,
  getRuntimeSyncTransport
} from "@/runtime/cloudServices";
import {
  runtimeProfile,
  type RuntimeProfile
} from "@/runtime/environment";

import type { BackgroundSyncTask } from "./backgroundSyncTask";
import type {
  BackgroundSyncRunResult,
  BackgroundSyncSkipReason
} from "./runBackgroundSync";

type HeadlessUnavailableState =
  | { readonly kind: "signed-out" }
  | { readonly kind: "vault-locked" }
  | { readonly kind: "provider-missing" };

export type HeadlessForegroundOnlyReason =
  | "signed-out"
  | "provider-missing"
  | "device-unlock-required";

export interface HeadlessBackgroundSyncDependencies {
  readonly profile: () => RuntimeProfile;
  readonly authGateway: () => AccountAuthGateway;
  readonly providersReady: () => boolean;
  readonly nowMs?: () => number;
}

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

function validRoutingIdentity(value: string | null): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    value.trim() === value &&
    !CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function eligibleSignedSession(
  session: AuthSessionDescriptor,
  nowMs: number
): boolean {
  const expiry =
    session.expiresAt === null ? null : Date.parse(session.expiresAt);
  return (
    session.assurance === "verified-email" &&
    session.identity.emailVerified &&
    validRoutingIdentity(session.identity.id) &&
    session.onboarding === "complete" &&
    validRoutingIdentity(session.activeHouseholdId) &&
    validRoutingIdentity(session.activeMembershipId) &&
    (session.activeHouseholdRole === "owner" ||
      session.activeHouseholdRole === "editor" ||
      session.activeHouseholdRole === "viewer") &&
    (expiry === null || (Number.isFinite(expiry) && expiry > nowMs))
  );
}

const productionDependencies: HeadlessBackgroundSyncDependencies = {
  profile: () => runtimeProfile,
  authGateway: createRuntimeAuthGateway,
  providersReady: () =>
    Boolean(
      getRuntimeSyncTransport() &&
        getRuntimeEvidenceUploadPort() &&
        getRuntimeEvidenceDownloadPort()
    )
};

/**
 * Resolves only the prerequisites that are safe to inspect without mounting
 * React or opening a vault. Signed ALYR vaults are released by an interactive
 * DeviceAuthProvider grant. That grant is intentionally process/UI scoped, so
 * a headless launch must stay locked even when iOS can read WHEN_UNLOCKED
 * Keychain records.
 *
 * Opening SQLCipher here merely because the phone is unlocked would bypass
 * ALYR's manual and two-minute relock policy. Until vault keys use a reviewed
 * background-capable access-control policy, a terminated cold launch remains
 * foreground-only; a suspended live process may use its existing grant.
 */
export async function resolveHeadlessBackgroundSyncState(
  dependencies: HeadlessBackgroundSyncDependencies = productionDependencies
): Promise<HeadlessUnavailableState> {
  if (dependencies.profile() !== "native-secure") {
    // Expo Go, web, tests, and session-only previews never inspect persisted
    // identity or acquire a signed-vault capability.
    return { kind: "signed-out" };
  }

  let gateway: AccountAuthGateway;
  try {
    gateway = dependencies.authGateway();
  } catch {
    return { kind: "provider-missing" };
  }
  if (gateway.mode !== "supabase") {
    return { kind: "provider-missing" };
  }

  let sessionResult: Awaited<ReturnType<AccountAuthGateway["currentSession"]>>;
  try {
    sessionResult = await gateway.currentSession();
  } catch {
    return { kind: "provider-missing" };
  }
  if (
    !sessionResult.ok ||
    !sessionResult.value ||
    !eligibleSignedSession(
      sessionResult.value,
      (dependencies.nowMs ?? Date.now)()
    )
  ) {
    return sessionResult.ok
      ? { kind: "signed-out" }
      : { kind: "provider-missing" };
  }

  try {
    if (!dependencies.providersReady()) {
      return { kind: "provider-missing" };
    }
  } catch {
    return { kind: "provider-missing" };
  }

  // Every cloud and identity prerequisite is present, but the interactive
  // device-auth grant is deliberately unavailable in a no-view launch.
  return { kind: "vault-locked" };
}

function skipped(
  reason: Extract<
    BackgroundSyncSkipReason,
    "signed-out" | "provider-missing" | "vault-locked"
  >
): BackgroundSyncRunResult {
  return {
    kind: "skipped",
    reason,
    metadataOperationsAttempted: 0,
    evidenceTransfersAttempted: 0
  };
}

/**
 * Installed before TaskManager.defineTask. It returns a typed, privacy-safe
 * state rather than treating an absent React provider as an unexplained
 * success. It may inspect signed-session eligibility, but no repository,
 * attachment store, vault key, or preview workspace is opened by this task.
 */
export function createHeadlessBackgroundSyncTask(
  dependencies: HeadlessBackgroundSyncDependencies = productionDependencies
): BackgroundSyncTask {
  return async () => {
    const state = await resolveHeadlessBackgroundSyncState(dependencies);
    return skipped(state.kind);
  };
}

export async function resolveHeadlessRegistrationDisposition(
  dependencies: HeadlessBackgroundSyncDependencies = productionDependencies
): Promise<{
  readonly kind: "foreground-only";
  readonly reason: HeadlessForegroundOnlyReason;
}> {
  const state = await resolveHeadlessBackgroundSyncState(dependencies);
  return {
    kind: "foreground-only",
    reason:
      state.kind === "vault-locked"
        ? "device-unlock-required"
        : state.kind
  };
}
