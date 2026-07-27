import * as SecureStore from "expo-secure-store";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Platform } from "react-native";

import type {
  AuthGatewayMode,
  AuthSessionDescriptor
} from "@/auth/types";
import {
  deriveAuthenticatedVaultScope,
  DEVICE_PREVIEW_VAULT_SCOPE
} from "@/data/vaultScope";

import type { ValueVisibility } from "./ValueVisibility";

const STORAGE_KEY_PREFIX = "alyr.portfolio.value-visibility.v2";

export type ValueVisibilityScope =
  | { readonly kind: "device-preview" }
  | {
      readonly kind: "account-household";
      readonly accountId: string;
      readonly householdId: string;
    };

interface ScopedVisibilityState {
  readonly scopeIdentity: string | null;
  readonly visibility: ValueVisibility;
}

interface PortfolioPrivacyValue {
  readonly visibility: ValueVisibility;
  readonly amountsHidden: boolean;
  readonly setAmountsHidden: (hidden: boolean) => void;
  readonly toggleAmountsHidden: () => void;
}

const PortfolioPrivacyContext =
  createContext<PortfolioPrivacyValue | null>(null);

export function portfolioAmountsHiddenFromStorage(
  stored: string | null
): boolean {
  // Privacy is the default for a new install, an older install without this
  // scoped preference, and any unrecognized value. Only an explicit choice to
  // reveal amounts opens the active account + household boundary.
  return stored !== "visible";
}

export function valueVisibilityScopeForSession(
  mode: AuthGatewayMode,
  session: AuthSessionDescriptor | null
): ValueVisibilityScope | null {
  if (session?.identity.id && session.activeHouseholdId) {
    return {
      kind: "account-household",
      accountId: session.identity.id,
      householdId: session.activeHouseholdId
    };
  }
  return mode === "preview" ? { kind: "device-preview" } : null;
}

export function valueVisibilityScopeIdentity(
  scope: ValueVisibilityScope | null
): string | null {
  if (!scope) return null;
  return scope.kind === "device-preview"
    ? DEVICE_PREVIEW_VAULT_SCOPE.scopeId
    : JSON.stringify([scope.accountId, scope.householdId]);
}

export async function portfolioVisibilityStorageKey(
  scope: ValueVisibilityScope
): Promise<string> {
  const scopeId =
    scope.kind === "device-preview"
      ? DEVICE_PREVIEW_VAULT_SCOPE.scopeId
      : (
          await deriveAuthenticatedVaultScope(
            scope.accountId,
            scope.householdId
          )
        ).scopeId;
  return `${STORAGE_KEY_PREFIX}.${scopeId}`;
}

async function readPreference(
  scope: ValueVisibilityScope
): Promise<boolean> {
  try {
    const key = await portfolioVisibilityStorageKey(scope);
    const stored =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(key) ?? null
        : await SecureStore.getItemAsync(key);
    return portfolioAmountsHiddenFromStorage(stored);
  } catch {
    return true;
  }
}

async function persistPreference(
  scope: ValueVisibilityScope,
  hidden: boolean
): Promise<void> {
  try {
    const key = await portfolioVisibilityStorageKey(scope);
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(
        key,
        hidden ? "hidden" : "visible"
      );
      return;
    }
    await SecureStore.setItemAsync(
      key,
      hidden ? "hidden" : "visible"
    );
  } catch {
    // The explicit choice still applies to this running boundary. A future
    // launch fails closed when persistence is unavailable.
  }
}

export function PortfolioPrivacyProvider({
  children,
  scope
}: PropsWithChildren<{
  readonly scope: ValueVisibilityScope | null;
}>) {
  const scopeIdentity = valueVisibilityScopeIdentity(scope);
  const revisionRef = useRef(0);
  const [state, setState] = useState<ScopedVisibilityState>({
    scopeIdentity,
    visibility: "hidden"
  });

  // Derive the effective value during render. This closes the transition frame
  // immediately when an account or household changes, before effects hydrate
  // the next boundary's independently stored preference.
  const visibility =
    state.scopeIdentity === scopeIdentity ? state.visibility : "hidden";
  const amountsHidden = visibility === "hidden";

  useEffect(() => {
    const revision = ++revisionRef.current;
    setState({
      scopeIdentity,
      visibility: "hidden"
    });
    if (!scope || !scopeIdentity) return;

    void readPreference(scope).then((hidden) => {
      if (revisionRef.current !== revision) return;
      setState({
        scopeIdentity,
        visibility: hidden ? "hidden" : "visible"
      });
    });
  }, [scope, scopeIdentity]);

  const setAmountsHidden = useCallback(
    (hidden: boolean) => {
      ++revisionRef.current;
      if (!scope || !scopeIdentity) {
        setState({
          scopeIdentity: null,
          visibility: "hidden"
        });
        return;
      }
      setState({
        scopeIdentity,
        visibility: hidden ? "hidden" : "visible"
      });
      void persistPreference(scope, hidden);
    },
    [scope, scopeIdentity]
  );

  const toggleAmountsHidden = useCallback(() => {
    setAmountsHidden(!amountsHidden);
  }, [amountsHidden, setAmountsHidden]);

  const value = useMemo(
    () => ({
      visibility,
      amountsHidden,
      setAmountsHidden,
      toggleAmountsHidden
    }),
    [
      amountsHidden,
      setAmountsHidden,
      toggleAmountsHidden,
      visibility
    ]
  );

  return (
    <PortfolioPrivacyContext.Provider value={value}>
      {children}
    </PortfolioPrivacyContext.Provider>
  );
}

export function usePortfolioPrivacy(): PortfolioPrivacyValue {
  const value = useContext(PortfolioPrivacyContext);
  if (!value) {
    throw new Error(
      "usePortfolioPrivacy must be used inside PortfolioPrivacyProvider"
    );
  }
  return value;
}
