import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type {
  HouseholdStorageUsagePort,
  HouseholdStorageUsageResponse
} from "@alyr/contracts";

import type { VerifiedHouseholdAccess } from "@/auth/verifiedHouseholdAccess";
import type { WorkspaceMode } from "@/domain/model";

interface TaggedUsage {
  readonly accessKey: string;
  readonly usage: HouseholdStorageUsageResponse;
}

const STORAGE_USAGE_REQUEST_TIMEOUT_MS = 15_000;

export interface FocusedHouseholdStorageUsageOptions {
  readonly access: VerifiedHouseholdAccess | null;
  readonly workspaceMode: WorkspaceMode | null;
  readonly requestPaused: boolean;
  readonly refreshKey: string;
  readonly port: HouseholdStorageUsagePort | null;
}

function appStateAllowsRequest(state: AppStateStatus | null): boolean {
  // React Native can briefly report null while the initial state is loaded.
  // Treat only known non-foreground states as paused so first launch cannot
  // become stuck waiting for an AppState transition that never arrives.
  return state !== "background" && state !== "inactive";
}

function accessIdentity(
  access: VerifiedHouseholdAccess | null
): string | null {
  return access
    ? [
        access.accountId,
        access.householdId,
        access.membershipId,
        access.role
      ].join(":")
    : null;
}

/**
 * Holds one focus-scoped measurement in memory. A changed session/household,
 * blur, or newer request invalidates the active generation before an older
 * response can become visible.
 */
export function useFocusedHouseholdStorageUsage({
  access,
  workspaceMode,
  requestPaused,
  refreshKey,
  port
}: FocusedHouseholdStorageUsageOptions): HouseholdStorageUsageResponse | null {
  const accessKey = accessIdentity(access);
  const accountId = access?.accountId ?? null;
  const householdId = access?.householdId ?? null;
  const membershipId = access?.membershipId ?? null;
  const role = access?.role ?? null;
  const [taggedUsage, setTaggedUsage] = useState<TaggedUsage | null>(null);
  const [appState, setAppState] = useState<AppStateStatus | null>(
    AppState.currentState
  );
  const generation = useRef(0);
  const requestsPaused =
    requestPaused || !appStateAllowsRequest(appState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    generation.current += 1;
    setTaggedUsage(null);
  }, [accessKey, port, refreshKey, requestsPaused, workspaceMode]);

  useFocusEffect(
    useCallback(() => {
      const requestGeneration = generation.current + 1;
      generation.current = requestGeneration;
      setTaggedUsage(null);

      if (
        !accountId ||
        !householdId ||
        !membershipId ||
        !role ||
        !accessKey ||
        workspaceMode !== "personal" ||
        requestsPaused ||
        !port
      ) {
        return () => {
          if (generation.current === requestGeneration) {
            generation.current += 1;
          }
        };
      }

      const requestedHouseholdId = householdId;
      const controller = new AbortController();
      const deadlineAtMs = Date.now() + STORAGE_USAGE_REQUEST_TIMEOUT_MS;
      const timeout = setTimeout(
        () => controller.abort(),
        STORAGE_USAGE_REQUEST_TIMEOUT_MS
      );
      void port
        .getUsage(requestedHouseholdId, {
          signal: controller.signal,
          deadlineAtMs
        })
        .then((result) => {
          if (
            generation.current !== requestGeneration ||
            !result.ok ||
            result.value.householdId !== requestedHouseholdId
          ) {
            return;
          }
          setTaggedUsage({
            accessKey,
            usage: result.value
          });
        })
        .catch(() => {
          // Unknown remains truthful for transport and implementation failures.
        })
        .finally(() => {
          clearTimeout(timeout);
        });

      return () => {
        clearTimeout(timeout);
        controller.abort();
        if (generation.current === requestGeneration) {
          generation.current += 1;
        }
      };
    }, [
      accessKey,
      accountId,
      householdId,
      membershipId,
      port,
      refreshKey,
      requestsPaused,
      role,
      workspaceMode
    ])
  );

  return !requestsPaused &&
    workspaceMode === "personal" &&
    Boolean(port) &&
    taggedUsage?.accessKey === accessKey
    ? taggedUsage.usage
    : null;
}
