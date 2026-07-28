import "react-native-url-polyfill/auto";

import { createClient, processLock } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { createExpoSecureSessionStorage } from "@/auth/expoSecureSessionStorage";
import { createExpoPasswordRecoverySessionMarkerStore } from "@/auth/expoPasswordRecoverySessionMarker";
import {
  createSupabaseAuthGateway,
  type SupabaseAuthClientLike
} from "@/auth/adapters/supabase";
import { createExpoPendingHouseholdInviteStore } from "@/auth/expoPendingHouseholdInvite";
import { createExpoPendingHouseholdProvisionStore } from "@/auth/expoPendingHouseholdProvision";
import { configurePendingHouseholdInviteStoreFactory } from "@/auth/pendingHouseholdInvite";
import { configurePendingHouseholdProvisionStoreFactory } from "@/auth/pendingHouseholdProvision";
import { createRecoveryProtectedAuthGateway } from "@/auth/recoveryProtectedAuthGateway";
import { configureAuthGatewayFactory } from "@/auth/runtime";
import type { AccountAuthGateway } from "@/auth/types";

import {
  configureRuntimeCloudExportPort,
  configureRuntimeEvidenceDownloadPort,
  configureRuntimeEvidenceUploadPort,
  configureRuntimeProductEventTransportFactory,
  configureRuntimeSyncTransport,
  createAuthenticatedCloudTransports
} from "./cloudServices";
import { runtimeProfile } from "./environment";
import {
  decideSignedSupabaseRuntime,
  type SignedSupabaseConfiguration
} from "./supabaseConfig";
import { attachSupabaseAutoRefresh } from "./supabaseAutoRefresh";

export interface SignedSupabaseRuntimeServices {
  readonly authGateway: AccountAuthGateway;
  readonly cloud: ReturnType<typeof createAuthenticatedCloudTransports>;
}

export type SignedSupabaseRuntimeInstallation =
  | { readonly kind: "skip-preview" }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "missing-environment"
        | "invalid-environment"
        | "client-initialization-failed";
    }
  | {
      readonly kind: "configured";
      readonly services: SignedSupabaseRuntimeServices;
    };

let installation: SignedSupabaseRuntimeInstallation | null = null;
let disposeInstallation: (() => void) | null = null;

function createServices(
  configuration: SignedSupabaseConfiguration
): {
  readonly services: SignedSupabaseRuntimeServices;
  readonly dispose: () => void;
} {
  const client = createClient(
    configuration.projectUrl,
    configuration.publishableKey,
    {
      auth: {
        storage: createExpoSecureSessionStorage(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        lock: processLock
      }
    }
  );
  // The local port intentionally models only the stable auth methods used by
  // ALYR. Supabase's generated response unions are structurally compatible at
  // runtime but stricter than that narrow testable interface.
  const providerAuthGateway = createSupabaseAuthGateway(
    client as unknown as SupabaseAuthClientLike,
    {
      emailRedirectTo: configuration.emailRedirectTo,
      pilotAccessEndpoint: configuration.pilotAccessEndpoint,
      householdInviteAccessEndpoint:
        configuration.householdInviteAccessEndpoint,
      publicApiKey: configuration.publishableKey,
      passwordRecoveryRedirectTo:
        configuration.passwordRecoveryRedirectTo
    }
  );
  const authGateway = createRecoveryProtectedAuthGateway(
    providerAuthGateway,
    {
      markerStore: createExpoPasswordRecoverySessionMarkerStore()
    }
  );
  const cloud = createAuthenticatedCloudTransports(
    authGateway,
    configuration.apiBaseUrl
  );
  const detachAutoRefresh = attachSupabaseAutoRefresh(
    client.auth,
    AppState
  );
  const removeFactory = configureAuthGatewayFactory(() => authGateway);
  const removePendingInviteStore =
    configurePendingHouseholdInviteStoreFactory(
      createExpoPendingHouseholdInviteStore
    );
  const removePendingProvisionStore =
    configurePendingHouseholdProvisionStoreFactory(
      createExpoPendingHouseholdProvisionStore
    );
  const removeSyncTransport = configureRuntimeSyncTransport(cloud.sync);
  const removeEvidenceUploads = configureRuntimeEvidenceUploadPort(
    cloud.evidenceUploads
  );
  const removeEvidenceDownloads = configureRuntimeEvidenceDownloadPort(
    cloud.evidenceDownloads
  );
  const removeCloudExports = configureRuntimeCloudExportPort(
    cloud.cloudExports
  );
  const removeProductEvents =
    configureRuntimeProductEventTransportFactory(
      cloud.productEventsForHousehold
    );

  return {
    services: { authGateway, cloud },
    dispose() {
      removeFactory();
      removePendingInviteStore();
      removePendingProvisionStore();
      removeSyncTransport();
      removeEvidenceUploads();
      removeEvidenceDownloads();
      removeCloudExports();
      removeProductEvents();
      detachAutoRefresh();
    }
  };
}

/**
 * Installs the singleton user-scoped Supabase runtime before AuthFlowProvider
 * mounts. Missing/unsafe configuration leaves the signed app on the existing
 * unavailable gateway rather than falling back to a preview identity.
 */
export function installSignedSupabaseRuntimeFromEnvironment(): SignedSupabaseRuntimeInstallation {
  if (installation) return installation;

  const decision = decideSignedSupabaseRuntime(runtimeProfile, {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  });
  if (decision.kind !== "configure") {
    installation = decision;
    return installation;
  }

  try {
    const created = createServices(decision.configuration);
    disposeInstallation = created.dispose;
    installation = {
      kind: "configured",
      services: created.services
    };
  } catch {
    installation = {
      kind: "unavailable",
      reason: "client-initialization-failed"
    };
  }
  return installation;
}

/** Test/HMR seam; production keeps the installation for the process lifetime. */
export function disposeSignedSupabaseRuntime(): void {
  disposeInstallation?.();
  disposeInstallation = null;
  installation = null;
}
