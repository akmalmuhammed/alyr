import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";

describe("reduced-motion preference", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads the system preference, subscribes, and cleans up", async () => {
    const remove = jest.fn();
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockReturnValue(
        { remove } as unknown as ReturnType<
          typeof AccessibilityInfo.addEventListener
        >
      );

    const hook = await renderHook(() => useReduceMotionPreference());
    await waitFor(() => expect(hook.result.current).toBe(true));
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
      "reduceMotionChanged",
      expect.any(Function)
    );

    await act(async () => {
      hook.unmount();
    });
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });
});
