import { useMemo, type PropsWithChildren } from "react";
import type { SyncTransport } from "@alyr/contracts";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { useDeviceAuth } from "@/deviceAuth";
import type {
  AuthGatewayMode,
  AuthSessionDescriptor
} from "@/auth/types";
import type { WorkspaceMode } from "@/domain/model";
import type { EvidenceDownloadPort } from "@/data/evidenceDownload";
import type { EvidenceUploadPort } from "@/data/evidenceUpload";
import type { ProductEventTransport } from "@/analytics";
import {
  getRuntimeEvidenceDownloadPort,
  getRuntimeEvidenceUploadPort,
  getRuntimeProductEventTransport,
  getRuntimeSyncTransport
} from "@/runtime/cloudServices";
import {
  runtimeProfile,
  type RuntimeProfile
} from "@/runtime/environment";

import {
  WorkspaceProvider,
  type WorkspaceVaultAccess
} from "./WorkspaceProvider";

export function workspaceVaultAccessForSession(
  mode: AuthGatewayMode,
  session: AuthSessionDescriptor | null,
  profile: RuntimeProfile = runtimeProfile
): WorkspaceVaultAccess | null {
  if (mode === "preview") {
    return { kind: "preview" };
  }
  if (
    profile === "native-secure" &&
    session === null &&
    (mode === "supabase" || mode === "unavailable")
  ) {
    return { kind: "signed-sample" };
  }
  if (mode === "supabase" && session === null) {
    return { kind: "preview" };
  }
  if (
    mode !== "supabase" ||
    !session ||
    session.assurance !== "verified-email" ||
    !session.identity.emailVerified ||
    !session.activeHouseholdId ||
    !session.activeMembershipId ||
    !session.activeHouseholdRole
  ) {
    return null;
  }
  return {
    kind: "authenticated",
    accountId: session.identity.id,
    householdId: session.activeHouseholdId,
    role: session.activeHouseholdRole
  };
}

export function signedOutSampleWorkspaceReady(
  mode: AuthGatewayMode,
  session: AuthSessionDescriptor | null,
  workspaceMode: WorkspaceMode | null
): boolean {
  return (
    (mode === "supabase" || mode === "unavailable") &&
    session === null &&
    workspaceMode === "sample"
  );
}

export function releaseWorkspaceVaultAccess(
  access: WorkspaceVaultAccess | null,
  deviceAuthReleased: boolean
): WorkspaceVaultAccess | null {
  if (access?.kind === "authenticated" && !deviceAuthReleased) {
    return null;
  }
  return access;
}

/**
 * Remounts the workspace boundary whenever account or household identity
 * changes. The previous provider locks both local resources during unmount,
 * while the next provider starts with no workspace until its own scoped vault
 * has been opened and validated.
 */
export function SessionBoundWorkspaceProvider({
  children,
  syncTransport,
  evidenceUploadPort,
  evidenceDownloadPort,
  productEventTransport
}: PropsWithChildren<{
  readonly syncTransport?: SyncTransport | null;
  readonly evidenceUploadPort?: EvidenceUploadPort | null;
  readonly evidenceDownloadPort?: EvidenceDownloadPort | null;
  readonly productEventTransport?: ProductEventTransport | null;
}>) {
  const { mode, session } = useAuthFlow();
  const { vaultReleased } = useDeviceAuth();
  const sessionVaultAccess = useMemo(
    () => workspaceVaultAccessForSession(mode, session, runtimeProfile),
    [mode, session]
  );
  const vaultAccess = releaseWorkspaceVaultAccess(
    sessionVaultAccess,
    vaultReleased
  );
  const boundaryKey =
    vaultAccess?.kind === "authenticated"
      ? `authenticated:${vaultAccess.accountId}:${vaultAccess.householdId}:${vaultAccess.role}`
      : vaultAccess?.kind === "signed-sample"
        ? "signed-sample"
      : vaultAccess?.kind === "preview"
        ? "preview"
        : sessionVaultAccess?.kind === "authenticated"
          ? `device-locked:${sessionVaultAccess.accountId}:${sessionVaultAccess.householdId}:${sessionVaultAccess.role}`
          : `locked:${mode}:${session?.identity.id ?? "signed-out"}`;
  const resolvedSyncTransport =
    syncTransport === undefined
      ? getRuntimeSyncTransport()
      : syncTransport;
  const resolvedEvidenceUploadPort =
    evidenceUploadPort === undefined
      ? getRuntimeEvidenceUploadPort()
      : evidenceUploadPort;
  const resolvedEvidenceDownloadPort =
    evidenceDownloadPort === undefined
      ? getRuntimeEvidenceDownloadPort()
      : evidenceDownloadPort;
  const resolvedProductEventTransport =
    productEventTransport === undefined &&
    vaultAccess?.kind === "authenticated"
      ? getRuntimeProductEventTransport(vaultAccess.householdId)
      : productEventTransport ?? null;

  return (
    <WorkspaceProvider
      key={boundaryKey}
      vaultAccess={vaultAccess}
      syncTransport={
        vaultAccess?.kind === "authenticated"
          ? resolvedSyncTransport
          : null
      }
      evidenceUploadPort={
        vaultAccess?.kind === "authenticated"
          ? resolvedEvidenceUploadPort
          : null
      }
      evidenceDownloadPort={
        vaultAccess?.kind === "authenticated"
          ? resolvedEvidenceDownloadPort
          : null
      }
      productEventTransport={
        vaultAccess?.kind === "authenticated"
          ? resolvedProductEventTransport
          : null
      }
    >
      {children}
    </WorkspaceProvider>
  );
}
