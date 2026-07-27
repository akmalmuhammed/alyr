export interface SupabaseRefreshAuth {
  startAutoRefresh(): Promise<void>;
  stopAutoRefresh(): Promise<void>;
}

export interface AppStateSubscription {
  remove(): void;
}

export interface AppStatePort {
  readonly currentState: string;
  addEventListener(
    event: "change",
    listener: (state: string) => void
  ): AppStateSubscription;
}

function settle(operation: Promise<void>): void {
  void operation.catch(() => {
    // Session bootstrap and auth events expose actionable provider failures.
    // Foreground lifecycle changes must never create an unhandled rejection.
  });
}

/**
 * Mirrors Supabase's React Native foreground-refresh guidance and registers
 * exactly one AppState listener for this client lifecycle.
 */
export function attachSupabaseAutoRefresh(
  auth: SupabaseRefreshAuth,
  appState: AppStatePort
): () => void {
  const apply = (state: string) => {
    settle(
      state === "active"
        ? auth.startAutoRefresh()
        : auth.stopAutoRefresh()
    );
  };
  apply(appState.currentState);
  const subscription = appState.addEventListener("change", apply);
  return () => {
    subscription.remove();
    settle(auth.stopAutoRefresh());
  };
}
