import type { WorkspaceMode } from "@/domain/model";

import type {
  AuthGatewayMode,
  AuthSessionDescriptor
} from "./types";

export type SignedOutSampleExitResult =
  | "exited"
  | "not-signed-out-sample"
  | "reset-failed";

/**
 * A signed-out sample is a device-local product tour, not an account session.
 * Keep its destructive control separate from account sign-out and deletion.
 */
export function canExitSignedOutSample(input: {
  readonly mode: AuthGatewayMode;
  readonly session: AuthSessionDescriptor | null;
  readonly workspaceMode: WorkspaceMode | null;
}): boolean {
  return (
    (input.mode === "supabase" || input.mode === "unavailable") &&
    input.session === null &&
    input.workspaceMode === "sample"
  );
}

/**
 * Removes only the isolated signed-out sample scope, then returns to Welcome.
 *
 * The reset port is deliberately narrower than the general vault purge API.
 * A verified session, preview workspace, or personal workspace is rejected
 * before any destructive callback can run.
 */
export async function completeSignedOutSampleExit(input: {
  readonly mode: AuthGatewayMode;
  readonly session: AuthSessionDescriptor | null;
  readonly workspaceMode: WorkspaceMode | null;
  readonly resetSampleVault: () => Promise<void>;
  readonly clearDeviceAuthorization: () => void;
  readonly routeToWelcome: () => void;
}): Promise<SignedOutSampleExitResult> {
  if (!canExitSignedOutSample(input)) {
    return "not-signed-out-sample";
  }

  try {
    await input.resetSampleVault();
  } catch {
    return "reset-failed";
  }

  input.clearDeviceAuthorization();
  input.routeToWelcome();
  return "exited";
}
