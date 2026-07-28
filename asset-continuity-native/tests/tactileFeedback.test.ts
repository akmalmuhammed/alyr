const mockSelectionAsync = jest.fn<Promise<void>, []>(
  async () => undefined
);
const mockNotificationAsync = jest.fn<Promise<void>, [unknown]>(
  async () => undefined
);

jest.mock("expo-haptics", () => ({
  __esModule: true,
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning"
  },
  notificationAsync: (value: unknown) =>
    mockNotificationAsync(value),
  selectionAsync: () => mockSelectionAsync()
}));

import { playTactileFeedback } from "@/feedback/tactileFeedback";

describe("native tactile feedback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps the three restrained moments to native feedback", async () => {
    await playTactileFeedback("selection", { platform: "ios" });
    await playTactileFeedback("success", { platform: "android" });
    await playTactileFeedback("destructive", { platform: "ios" });

    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
    expect(mockNotificationAsync).toHaveBeenNthCalledWith(
      1,
      "success"
    );
    expect(mockNotificationAsync).toHaveBeenNthCalledWith(
      2,
      "warning"
    );
  });

  it("does nothing on web or when Reduce Motion is enabled", async () => {
    await playTactileFeedback("selection", { platform: "web" });
    await playTactileFeedback("success", {
      platform: "ios",
      reduceMotion: true
    });

    expect(mockSelectionAsync).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  it("never turns unavailable haptics into an action failure", async () => {
    mockNotificationAsync.mockRejectedValueOnce(
      new Error("Native haptics unavailable")
    );

    await expect(
      playTactileFeedback("success", { platform: "ios" })
    ).resolves.toBeUndefined();
  });
});
