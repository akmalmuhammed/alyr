import {
  act,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import {
  AppState,
  Pressable,
  Text,
  View,
  type AppStateStatus
} from "react-native";

import type { AuthSessionDescriptor } from "@/auth/types";
import { vaultScopeFromOpaqueId } from "@/data/vaultScope";
import type { NativeWorkspace } from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import {
  ReviewReminderProvider,
  ReviewReminderWorkspaceObserver,
  useReviewReminder,
  type ReviewReminderManagerPort
} from "@/notifications/ReviewReminderProvider";

let mockMode: "preview" | "supabase" | "unavailable" =
  "supabase";
let mockBootstrapState: "bootstrapping" | "ready" | "error" =
  "ready";
let mockSession: AuthSessionDescriptor | null = null;
let mockWorkspace: NativeWorkspace | null = null;

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => ({
    bootstrapState: mockBootstrapState,
    mode: mockMode,
    session: mockSession
  })
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    workspace: mockWorkspace
  })
}));

jest.mock("@/notifications/expoReviewReminderRuntime", () => ({
  createExpoLocalReviewReminderManager: jest.fn()
}));

const scopeA = vaultScopeFromOpaqueId(
  `auth-v1-${"a".repeat(64)}`
);
const scopeB = vaultScopeFromOpaqueId(
  `auth-v1-${"b".repeat(64)}`
);

function signedSession(
  accountId: string,
  householdId: string
): AuthSessionDescriptor {
  return {
    identity: {
      id: accountId,
      email: `${accountId}@example.test`,
      emailVerified: true
    },
    assurance: "verified-email",
    expiresAt: "2027-07-28T12:00:00.000Z",
    onboarding: "complete",
    activeHouseholdId: householdId,
    activeMembershipId: `membership-${accountId}`,
    activeHouseholdRole: "owner"
  };
}

function personalWorkspace(
  householdId: string
): NativeWorkspace {
  const workspace = createWorkspace("personal");
  return {
    ...workspace,
    household: {
      ...workspace.household,
      id: householdId
    },
    members: workspace.members.map((member) => ({
      ...member,
      householdId
    }))
  };
}

function createManager(
  enabled = false
): ReviewReminderManagerPort & {
  readonly getPreferences: jest.Mock;
  readonly reconcile: jest.Mock;
  readonly optIn: jest.Mock;
  readonly optOut: jest.Mock;
  readonly cancel: jest.Mock;
  readonly retryPendingCleanup: jest.Mock;
} {
  const getPreferences = jest.fn<
    ReturnType<ReviewReminderManagerPort["getPreferences"]>,
    Parameters<ReviewReminderManagerPort["getPreferences"]>
  >(async () => ({
    version: 1,
    enabled,
    localHour: 9,
    localMinute: 0
  }));
  return {
    getPreferences,
    reconcile: jest.fn<
      ReturnType<ReviewReminderManagerPort["reconcile"]>,
      Parameters<ReviewReminderManagerPort["reconcile"]>
    >(async () =>
        enabled
          ? {
              kind: "unchanged",
              permission: "authorized",
              notificationIdentifier: "native-review",
              scheduledAt: "2027-01-20T06:00:00.000Z"
            }
          : {
              kind: "disabled",
              permission: null,
              notificationIdentifier: null,
              scheduledAt: null
            }
      ),
    optIn: jest.fn<
      ReturnType<ReviewReminderManagerPort["optIn"]>,
      Parameters<ReviewReminderManagerPort["optIn"]>
    >(async () => ({
        kind: "permission-blocked",
        permission: "denied",
        notificationIdentifier: null,
        scheduledAt: null
      })),
    optOut: jest.fn<
      ReturnType<ReviewReminderManagerPort["optOut"]>,
      Parameters<ReviewReminderManagerPort["optOut"]>
    >(async () => ({
      kind: "cancelled",
      cleanupPending: false
    })),
    cancel: jest.fn<
      ReturnType<ReviewReminderManagerPort["cancel"]>,
      Parameters<ReviewReminderManagerPort["cancel"]>
    >(async () => ({
      kind: "cancelled",
      cleanupPending: false
    })),
    retryPendingCleanup: jest.fn<
      ReturnType<ReviewReminderManagerPort["retryPendingCleanup"]>,
      Parameters<ReviewReminderManagerPort["retryPendingCleanup"]>
    >(async () => ({
      kind: "cancelled",
      cleanupPending: false
    }))
  };
}

function ReminderProbe() {
  const reminder = useReviewReminder();
  return (
    <View>
      <Text testID="reminder-probe-state">
        {[
          reminder.status,
          reminder.enabled,
          reminder.available,
          reminder.busy
        ].join("|")}
      </Text>
      <Pressable
        onPress={() => void reminder.enable()}
        testID="reminder-probe-enable"
      />
      <Pressable
        onPress={() => void reminder.disable()}
        testID="reminder-probe-disable"
      />
    </View>
  );
}

function reminderTree(
  manager: ReviewReminderManagerPort,
  deriveScope = jest.fn(
    async (_accountId: string, householdId: string) =>
      householdId === "household-b" ? scopeB : scopeA
  )
) {
  return (
    <ReviewReminderProvider
      deriveScope={deriveScope}
      manager={manager}
    >
      <ReviewReminderWorkspaceObserver>
        <ReminderProbe />
      </ReviewReminderWorkspaceObserver>
    </ReviewReminderProvider>
  );
}

describe("ReviewReminderProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMode = "supabase";
    mockBootstrapState = "ready";
    mockWorkspace = personalWorkspace("household-a");
    mockSession = signedSession("account-a", "household-a");
  });

  it("reconciles without prompting, then uses 09:00 only after explicit opt-in", async () => {
    const manager = createManager(false);
    const screen = await render(reminderTree(manager));

    await waitFor(() => {
      expect(
        screen.getByTestId("reminder-probe-state").props.children
      ).toBe("disabled|false|true|false");
    });
    expect(manager.reconcile).toHaveBeenCalledTimes(1);
    expect(manager.optIn).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByTestId("reminder-probe-enable")
    );

    await waitFor(() => {
      expect(manager.optIn).toHaveBeenCalledWith({
        scope: scopeA,
        workspace: mockWorkspace,
        runtime: "supabase",
        localHour: 9,
        localMinute: 0
      });
      expect(
        screen.getByTestId("reminder-probe-state").props.children
      ).toBe("permission-blocked|false|true|false");
    });
    await screen.unmount();
  });

  it("preserves an existing schedule while the device vault is merely locked", async () => {
    const manager = createManager(true);
    const screen = await render(reminderTree(manager));

    await waitFor(() => {
      expect(
        screen.getByTestId("reminder-probe-state").props.children
      ).toBe("enabled|true|true|false");
    });
    manager.cancel.mockClear();

    mockWorkspace = null;
    await screen.rerender(reminderTree(manager));

    await waitFor(() => {
      expect(
        screen.getByTestId("reminder-probe-state").props.children
      ).toBe("enabled|true|false|false");
    });
    expect(manager.cancel).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("reports cleanup pending instead of disabled when OS cancellation is unconfirmed", async () => {
    const manager = createManager(true);
    manager.optOut.mockResolvedValue({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    const screen = await render(reminderTree(manager));

    await waitFor(() => {
      expect(
        screen.getByTestId("reminder-probe-state").props.children
      ).toBe("enabled|true|true|false");
    });
    await fireEvent.press(
      screen.getByTestId("reminder-probe-disable")
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("reminder-probe-state").props.children
      ).toBe("cleanup-pending|false|true|false");
    });
    await screen.unmount();
  });

  it("does not treat unresolved auth bootstrap as sign-out", async () => {
    const manager = createManager(true);
    mockBootstrapState = "bootstrapping";
    mockSession = null;
    mockWorkspace = null;
    const screen = await render(reminderTree(manager));

    expect(manager.cancel).not.toHaveBeenCalled();

    mockBootstrapState = "ready";
    await screen.rerender(reminderTree(manager));
    await waitFor(() =>
      expect(manager.cancel).toHaveBeenCalledWith(null)
    );
    await screen.unmount();
  });

  it("retries a pending cleanup when the app returns to the foreground", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    const addEventListener = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const manager = createManager(false);
    manager.reconcile
      .mockResolvedValueOnce({
        kind: "cleanup-pending",
        permission: null,
        notificationIdentifier: null,
        scheduledAt: null
      })
      .mockResolvedValue({
        kind: "disabled",
        permission: null,
        notificationIdentifier: null,
        scheduledAt: null
      });

    try {
      const screen = await render(reminderTree(manager));
      await waitFor(() => {
        expect(
          screen.getByTestId("reminder-probe-state").props.children
        ).toBe("cleanup-pending|false|true|false");
      });

      await act(async () => {
        appStateListener?.("active");
      });
      await waitFor(() => {
        expect(manager.reconcile).toHaveBeenCalledTimes(2);
        expect(
          screen.getByTestId("reminder-probe-state").props.children
        ).toBe("disabled|false|true|false");
      });
      await screen.unmount();
    } finally {
      addEventListener.mockRestore();
    }
  });

  it("retains a sign-out cleanup retry and clears the pending state on foreground", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    const addEventListener = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const manager = createManager(true);

    try {
      const screen = await render(reminderTree(manager));
      await waitFor(() => {
        expect(
          screen.getByTestId("reminder-probe-state").props.children
        ).toBe("enabled|true|true|false");
      });
      manager.cancel.mockResolvedValue({
        kind: "cleanup-pending",
        cleanupPending: true
      });
      mockSession = null;
      mockWorkspace = null;
      await screen.rerender(reminderTree(manager));
      await waitFor(() => {
        expect(manager.cancel).toHaveBeenCalledWith(scopeA);
        expect(
          screen.getByTestId("reminder-probe-state").props.children
        ).toBe("cleanup-pending|false|false|false");
      });

      manager.retryPendingCleanup.mockResolvedValue({
        kind: "cancelled",
        cleanupPending: false
      });
      await act(async () => {
        appStateListener?.("active");
      });
      await waitFor(() => {
        expect(
          manager.retryPendingCleanup
        ).toHaveBeenCalledTimes(1);
        expect(
          screen.getByTestId("reminder-probe-state").props.children
        ).toBe("unavailable|false|false|false");
      });
      await screen.unmount();
    } finally {
      addEventListener.mockRestore();
    }
  });

  it("cancels on account switch, sign-out, sample workspace, and preview", async () => {
    const manager = createManager(true);
    const screen = await render(reminderTree(manager));

    await waitFor(() =>
      expect(manager.reconcile).toHaveBeenCalledTimes(1)
    );
    manager.cancel.mockClear();

    mockSession = signedSession("account-b", "household-b");
    mockWorkspace = personalWorkspace("household-b");
    await screen.rerender(reminderTree(manager));
    await waitFor(() =>
      expect(manager.cancel).toHaveBeenCalledWith(scopeA)
    );

    manager.cancel.mockClear();
    mockWorkspace = createWorkspace("sample");
    await screen.rerender(reminderTree(manager));
    await waitFor(() =>
      expect(manager.cancel).toHaveBeenCalledWith(scopeB)
    );

    manager.cancel.mockClear();
    mockSession = null;
    await screen.rerender(reminderTree(manager));
    await waitFor(() =>
      expect(manager.cancel).toHaveBeenCalledWith(scopeB)
    );

    manager.cancel.mockClear();
    await screen.unmount();
    mockMode = "preview";
    mockWorkspace = createWorkspace("sample");
    const preview = await render(reminderTree(manager));
    await waitFor(() =>
      expect(manager.cancel).toHaveBeenCalledWith(null)
    );
    await preview.unmount();
  });
});
