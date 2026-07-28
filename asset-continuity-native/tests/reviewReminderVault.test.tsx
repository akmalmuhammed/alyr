import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import { Alert, StyleSheet } from "react-native";

import {
  ReviewReminderSettingsSection
} from "../app/(tabs)/vault";
import type {
  ReviewReminderContextValue,
  ReviewReminderStatus
} from "@/notifications/ReviewReminderProvider";

const mockEnable = jest.fn<
  Promise<ReviewReminderStatus>,
  []
>();
const mockDisable = jest.fn<
  Promise<ReviewReminderStatus>,
  []
>();
let mockReminder: ReviewReminderContextValue = {
  status: "disabled",
  enabled: false,
  available: true,
  busy: false,
  scheduledAt: null,
  permission: null,
  enable: mockEnable,
  disable: mockDisable
};

jest.mock("@/notifications/ReviewReminderProvider", () => ({
  useReviewReminder: () => mockReminder
}));

describe("Vault review reminder settings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnable.mockResolvedValue("permission-blocked");
    mockDisable.mockResolvedValue("disabled");
    mockReminder = {
      status: "disabled",
      enabled: false,
      available: true,
      busy: false,
      scheduledAt: null,
      permission: null,
      enable: mockEnable,
      disable: mockDisable
    };
  });

  it("shows the private 09:00 policy and asks permission only after the explicit toggle", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const screen = await render(
      <ReviewReminderSettingsSection language="en" rtl={false} />
    );

    expect(screen.getByText("Review reminders")).toBeTruthy();
    expect(screen.getByText("9:00 AM local time")).toBeTruthy();
    expect(
      screen.getByText(
        "The notification says only that a private review is ready."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("review-reminder-status").props.children)
      .toBe("Off");
    expect(mockEnable).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByTestId("review-reminder-toggle")
    );

    await waitFor(() => {
      expect(mockEnable).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith(
        "Notifications are off",
        "Allow ALYR notifications in device Settings, then turn the reminder on again.",
        [{ text: "OK" }]
      );
    });
  });

  it("renders a Dynamic Type-safe Arabic RTL row and exposes no-review state", async () => {
    mockReminder = {
      ...mockReminder,
      status: "no-review",
      enabled: true
    };
    const screen = await render(
      <ReviewReminderSettingsSection language="ar" rtl />
    );

    expect(screen.getByText("تذكيرات المراجعة")).toBeTruthy();
    expect(screen.getByText("لا توجد مراجعة مستحقة")).toBeTruthy();
    expect(screen.getByText("٩:٠٠ صباحًا بالتوقيت المحلي")).toBeTruthy();
    expect(
      StyleSheet.flatten(
        screen.getByTestId("review-reminder-toggle").props.style
      )
    ).toMatchObject({
      minHeight: 68,
      flexDirection: "row-reverse"
    });
    expect(
      screen.getByTestId(
        "review-reminder-switch",
        { includeHiddenElements: true }
      ).props.value
    ).toBe(true);

    await fireEvent.press(
      screen.getByTestId("review-reminder-toggle")
    );
    await waitFor(() =>
      expect(mockDisable).toHaveBeenCalledTimes(1)
    );
  });

  it.each([
    ["enabled", "On"],
    ["disabled", "Off"],
    ["no-review", "No review due"],
    ["permission-blocked", "Notifications off"]
  ] as const)("shows the %s status", async (status, label) => {
    mockReminder = {
      ...mockReminder,
      status,
      enabled: status === "enabled" || status === "no-review",
      permission:
        status === "permission-blocked" ? "denied" : null
    };
    const screen = await render(
      <ReviewReminderSettingsSection language="en" rtl={false} />
    );

    expect(
      screen.getByTestId("review-reminder-status").props.children
    ).toBe(label);
  });
});
