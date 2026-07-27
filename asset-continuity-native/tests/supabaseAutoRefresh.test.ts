import {
  attachSupabaseAutoRefresh,
  type AppStatePort
} from "@/runtime/supabaseAutoRefresh";

describe("Supabase foreground token refresh lifecycle", () => {
  it("starts in foreground, stops in background, and removes one listener", () => {
    const startAutoRefresh = jest.fn(async () => undefined);
    const stopAutoRefresh = jest.fn(async () => undefined);
    const remove = jest.fn();
    let listener: ((state: string) => void) | null = null;
    const appState: AppStatePort = {
      currentState: "active",
      addEventListener(_event, nextListener) {
        listener = nextListener;
        return { remove };
      }
    };

    const dispose = attachSupabaseAutoRefresh(
      { startAutoRefresh, stopAutoRefresh },
      appState
    );
    expect(startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(stopAutoRefresh).not.toHaveBeenCalled();

    (listener as ((state: string) => void) | null)?.("background");
    expect(stopAutoRefresh).toHaveBeenCalledTimes(1);
    (listener as ((state: string) => void) | null)?.("active");
    expect(startAutoRefresh).toHaveBeenCalledTimes(2);

    dispose();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(stopAutoRefresh).toHaveBeenCalledTimes(2);
  });
});
