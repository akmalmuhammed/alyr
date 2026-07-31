import {
  act,
  renderHook,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import {
  OnboardingIntroProvider,
  useOnboardingIntro
} from "@/onboarding/OnboardingIntroProvider";
import type { OnboardingSeenStore } from "@/onboarding/onboardingSeenStore";

describe("OnboardingIntroProvider", () => {
  it("exposes the hydrated route status and immediate completion", async () => {
    const store: OnboardingSeenStore = {
      load: jest.fn(async () => false),
      markSeen: jest.fn(async () => undefined),
      reset: jest.fn(async () => undefined)
    };
    const wrapper = ({ children }: PropsWithChildren) => (
      <OnboardingIntroProvider store={store}>
        {children}
      </OnboardingIntroProvider>
    );
    const hook = await renderHook(() => useOnboardingIntro(), {
      wrapper
    });

    await waitFor(() =>
      expect(hook.result.current.status).toBe("unseen")
    );
    await act(async () => {
      await hook.result.current.markSeen();
    });

    expect(hook.result.current.status).toBe("seen");
    expect(store.markSeen).toHaveBeenCalledTimes(1);
  });

  it("requires the installation-level provider", async () => {
    await expect(
      renderHook(() => useOnboardingIntro())
    ).rejects.toThrow(
      "useOnboardingIntro must be used inside OnboardingIntroProvider."
    );
  });
});
