import type {
  AccountDeletionPort,
  HouseholdAccessPort,
  SyncTransport
} from "@alyr/contracts";

import { HttpAccountDeletion } from "@/adapters/httpAccountDeletion";
import { HttpEvidenceDownloadPort } from "@/adapters/httpEvidenceDownload";
import { HttpEvidenceUploadPort } from "@/adapters/httpEvidenceUpload";
import { HttpHouseholdAccess } from "@/adapters/httpHouseholdAccess";
import {
  HttpSyncTransport,
  type SyncFetch
} from "@/adapters/httpSyncTransport";
import { createUserAccessTokenProvider } from "@/auth/accessToken";
import type { AccountAuthGateway } from "@/auth/types";
import { HttpCloudExport } from "@/adapters/httpCloudExport";
import type { CloudExportPort } from "@/data/cloudExport";
import type { EvidenceDownloadPort } from "@/data/evidenceDownload";
import type { EvidenceUploadPort } from "@/data/evidenceUpload";

export interface AuthenticatedCloudTransports {
  readonly sync: SyncTransport;
  readonly householdAccess: HouseholdAccessPort;
  readonly evidenceUploads: EvidenceUploadPort;
  readonly evidenceDownloads: EvidenceDownloadPort;
  readonly accountDeletion: AccountDeletionPort;
  readonly cloudExports: CloudExportPort;
}

let runtimeSyncTransport: SyncTransport | null = null;
let runtimeEvidenceUploadPort: EvidenceUploadPort | null = null;
let runtimeEvidenceDownloadPort: EvidenceDownloadPort | null = null;
let runtimeCloudExportPort: CloudExportPort | null = null;

/**
 * Process-local construction seam used by the session-bound workspace.
 * The transport still requests a fresh user bearer for every call; this
 * registry never stores tokens or household data.
 */
export function configureRuntimeSyncTransport(
  transport: SyncTransport
): () => void {
  runtimeSyncTransport = transport;
  return () => {
    if (runtimeSyncTransport === transport) {
      runtimeSyncTransport = null;
    }
  };
}

export function getRuntimeSyncTransport(): SyncTransport | null {
  return runtimeSyncTransport;
}

export function configureRuntimeEvidenceUploadPort(
  port: EvidenceUploadPort
): () => void {
  runtimeEvidenceUploadPort = port;
  return () => {
    if (runtimeEvidenceUploadPort === port) {
      runtimeEvidenceUploadPort = null;
    }
  };
}

export function getRuntimeEvidenceUploadPort(): EvidenceUploadPort | null {
  return runtimeEvidenceUploadPort;
}

export function configureRuntimeEvidenceDownloadPort(
  port: EvidenceDownloadPort
): () => void {
  runtimeEvidenceDownloadPort = port;
  return () => {
    if (runtimeEvidenceDownloadPort === port) {
      runtimeEvidenceDownloadPort = null;
    }
  };
}

export function getRuntimeEvidenceDownloadPort(): EvidenceDownloadPort | null {
  return runtimeEvidenceDownloadPort;
}

export function configureRuntimeCloudExportPort(
  port: CloudExportPort
): () => void {
  runtimeCloudExportPort = port;
  return () => {
    if (runtimeCloudExportPort === port) {
      runtimeCloudExportPort = null;
    }
  };
}

export function getRuntimeCloudExportPort(): CloudExportPort | null {
  return runtimeCloudExportPort;
}

/**
 * The one construction point for user-authenticated cloud transports.
 * Both transports request a current bearer directly from the same auth
 * gateway for every operation; no token is cached in app state.
 */
export function createAuthenticatedCloudTransports(
  gateway: AccountAuthGateway,
  apiBaseUrl: string,
  fetchImpl?: SyncFetch
): AuthenticatedCloudTransports {
  const getAccessToken = createUserAccessTokenProvider(gateway);
  const projectUrl = new URL(apiBaseUrl).origin;
  const common = {
    baseUrl: apiBaseUrl,
    getAccessToken,
    ...(fetchImpl ? { fetchImpl } : {})
  };
  return {
    sync: new HttpSyncTransport(common),
    householdAccess: new HttpHouseholdAccess(common),
    accountDeletion: new HttpAccountDeletion(common),
    cloudExports: new HttpCloudExport(common),
    evidenceDownloads: new HttpEvidenceDownloadPort({
      apiBaseUrl,
      getAccessToken,
      ...(fetchImpl ? { fetchImpl } : {})
    }),
    evidenceUploads: new HttpEvidenceUploadPort({
      apiBaseUrl,
      projectUrl,
      getAccessToken,
      ...(fetchImpl ? { fetchImpl } : {})
    })
  };
}
