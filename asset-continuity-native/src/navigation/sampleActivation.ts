import type {
  AuthGatewayMode,
  AuthSessionDescriptor
} from "@/auth/types";
import type { WorkspaceMode } from "@/domain/model";

import { AUTH_ROUTES } from "@/auth/routes";

export type SampleActivationDestination =
  | typeof AUTH_ROUTES.createAccount
  | "/personal-start";

/**
 * Keeps the isolated sample vault intact while choosing the correct boundary
 * for starting a real record:
 *
 * - the session-only preview may confirm a local sample replacement;
 * - the signed runtime must establish an account before it can open an
 *   authenticated household vault.
 */
export function sampleActivationDestination(input: {
  readonly canManageHousehold: boolean;
  readonly mode: AuthGatewayMode;
  readonly session: AuthSessionDescriptor | null;
  readonly workspaceMode: WorkspaceMode;
}): SampleActivationDestination | null {
  if (
    input.workspaceMode !== "sample" ||
    !input.canManageHousehold
  ) {
    return null;
  }
  if (input.mode === "preview") return "/personal-start";
  if (input.mode === "supabase" && input.session === null) {
    return AUTH_ROUTES.createAccount;
  }
  return null;
}
