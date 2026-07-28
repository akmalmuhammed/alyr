import {
  act,
  cleanup,
  fireEvent,
  render
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Alert, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import FamilyScreen from "../app/(tabs)/family";
import MemberAccessScreen from "../app/member-access";
import type { HouseholdAccessSnapshot } from "@alyr/contracts";
import { createWorkspace } from "@/domain/sample";
import {
  HOUSEHOLD_ADMIN_COPY,
  householdAccessErrorMessage
} from "@/i18n/householdAdminCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { colors } from "@/theme/tokens";

const householdId = "00000000-0000-4000-8000-000000000010";
const ownerMembershipId =
  "00000000-0000-4000-8000-000000000011";
const editorMembershipId =
  "00000000-0000-4000-8000-000000000012";
const ownerAccountId =
  "00000000-0000-4000-8000-000000000021";
const editorAccountId =
  "00000000-0000-4000-8000-000000000022";

const authoritativeSnapshot: HouseholdAccessSnapshot = {
  householdId,
  householdName: "Pearl household",
  householdVersion: 1,
  currentMembershipId: ownerMembershipId,
  currentAccountId: ownerAccountId,
  currentRole: "owner",
  members: [
    {
      membershipId: ownerMembershipId,
      householdId,
      accountId: ownerAccountId,
      displayName: "Amina Owner",
      email: "owner@example.com",
      role: "owner",
      status: "active",
      version: 2,
      joinedAt: "2026-07-20T12:00:00.000Z",
      isCurrentUser: true
    },
    {
      membershipId: editorMembershipId,
      householdId,
      accountId: editorAccountId,
      displayName: "Omar Editor",
      email: "editor@example.com",
      role: "editor",
      status: "active",
      version: 4,
      joinedAt: "2026-07-21T12:00:00.000Z",
      isCurrentUser: false
    }
  ],
  pendingInvites: [
    {
      inviteId: "00000000-0000-4000-8000-000000000031",
      householdId,
      role: "viewer",
      status: "pending",
      version: 1,
      createdAt: "2026-07-26T12:00:00.000Z",
      expiresAt: "2026-07-30T12:00:00.000Z"
    }
  ],
  refreshedAt: "2026-07-27T12:00:00.000Z"
};

let mockSnapshot: HouseholdAccessSnapshot | null =
  authoritativeSnapshot;
let mockAccessStatus: "ready" | "refreshing" | "error" = "ready";
let mockParams: { kind?: string; id?: string } = {
  kind: "member",
  id: editorMembershipId
};
const mockRefresh = jest.fn(async () => true);
const mockChangeRole = jest.fn(async () => true);
const mockRevoke = jest.fn(async () => true);
const mockCancelInvite = jest.fn(async () => true);
const mockTransfer = jest.fn(async () => true);
const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn()
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => ({
    mode: "supabase",
    busy: false,
    session: {
      identity: {
        id: ownerAccountId,
        email: "owner@example.com",
        emailVerified: true
      },
      assurance: "verified-email",
      expiresAt: "2026-07-28T12:00:00.000Z",
      onboarding: "complete",
      activeHouseholdId: householdId,
      activeMembershipId: ownerMembershipId,
      activeHouseholdRole: "owner"
    },
    householdAccessSnapshot: mockSnapshot,
    householdAccessStatus: mockAccessStatus,
    householdAccessError:
      mockAccessStatus === "error"
        ? {
            errorVersion: 1,
            code: "AUTHORIZATION_DENIED",
            message: "Access was revoked.",
            retryable: false
          }
        : null,
    refreshHouseholdAccess: mockRefresh,
    changeHouseholdMemberRole: mockChangeRole,
    revokeHouseholdMember: mockRevoke,
    cancelPendingHouseholdInvite: mockCancelInvite,
    transferHouseholdOwnership: mockTransfer
  })
}));

const mockWorkspace = {
  ...createWorkspace("personal"),
  household: {
    ...createWorkspace("personal").household,
    id: householdId,
    name: "Stale private household name"
  }
};

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({ workspace: mockWorkspace })
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, right: 0, bottom: 34, left: 0 }
};

function wrapper(language: "en" | "ar") {
  return function TestWrapper({ children }: PropsWithChildren) {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <LocaleProvider initialLanguage={language}>
          {children}
        </LocaleProvider>
      </SafeAreaProvider>
    );
  };
}

describe("household administration UI", () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockSnapshot = authoritativeSnapshot;
    mockAccessStatus = "ready";
    mockParams = { kind: "member", id: editorMembershipId };
  });

  it("renders only the authoritative signed roster and routes owner controls", async () => {
    const screen = await render(<FamilyScreen />, {
      wrapper: wrapper("en")
    });
    expect(screen.getByText("Pearl household")).toBeTruthy();
    const accessOverviewStyle = StyleSheet.flatten(
      screen.getByTestId("family-access-overview").props.style
    );
    expect(accessOverviewStyle).toMatchObject({
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.borderStrong
    });
    expect(accessOverviewStyle).not.toHaveProperty("backgroundColor");
    expect(accessOverviewStyle).not.toHaveProperty("borderRadius");
    expect(screen.queryByText("Stale private household name")).toBeNull();
    expect(screen.getByText("Omar Editor")).toBeTruthy();
    expect(
      screen.getByText(HOUSEHOLD_ADMIN_COPY.en.pendingSection)
    ).toBeTruthy();

    fireEvent.press(
      screen.getByRole("button", {
        name: /Omar Editor, Editor/u
      })
    );
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/member-access",
      params: { kind: "member", id: editorMembershipId }
    });
  });

  it("hides cached names and counts when active cloud membership is not verified", async () => {
    mockSnapshot = null;
    mockAccessStatus = "error";
    const screen = await render(<FamilyScreen />, {
      wrapper: wrapper("en")
    });

    expect(screen.queryByText("Pearl household")).toBeNull();
    expect(screen.queryByText("Stale private household name")).toBeNull();
    expect(screen.queryByText("Omar Editor")).toBeNull();
    expect(
      screen.getByText(
        householdAccessErrorMessage(
          {
            code: "AUTHORIZATION_DENIED",
            retryable: false
          },
          "en"
        )
      )
    ).toBeTruthy();
    expect(screen.queryByText("Access was revoked.")).toBeNull();
  });

  it("requires explicit confirmation before ownership transfer", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation();
    const screen = await render(<MemberAccessScreen />, {
      wrapper: wrapper("en")
    });

    expect(
      screen.getByText(HOUSEHOLD_ADMIN_COPY.en.transferBody)
    ).toBeTruthy();
    fireEvent.press(
      screen.getByRole("button", {
        name: HOUSEHOLD_ADMIN_COPY.en.transferAction
      })
    );
    expect(alert).toHaveBeenCalledWith(
      HOUSEHOLD_ADMIN_COPY.en.transferConfirmTitle,
      HOUSEHOLD_ADMIN_COPY.en.transferConfirmBody,
      expect.arrayContaining([
        expect.objectContaining({
          text: HOUSEHOLD_ADMIN_COPY.en.cancel,
          style: "cancel"
        }),
        expect.objectContaining({
          text: HOUSEHOLD_ADMIN_COPY.en.transferConfirmAction,
          style: "destructive"
        })
      ])
    );

    expect(mockTransfer).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("preserves Arabic RTL, role semantics, and 44-point actions", async () => {
    const screen = await render(<MemberAccessScreen />, {
      wrapper: wrapper("ar")
    });
    const copy = HOUSEHOLD_ADMIN_COPY.ar;

    expect(screen.getByText(copy.roleTitle)).toBeTruthy();
    const viewer = screen.getByRole("radio", {
      name: `${copy.viewer}. ${copy.viewerDescription}`
    });
    await act(async () => {
      fireEvent.press(viewer);
    });
    expect(
      screen.getByRole("radio", {
        name: `${copy.viewer}. ${copy.viewerDescription}`
      }).props.accessibilityState.checked
    ).toBe(true);
    const titleStyle = StyleSheet.flatten(
      screen.getAllByText(copy.transferTitle)[0]!.props.style
    );
    expect(titleStyle.writingDirection).toBe("rtl");
    expect(titleStyle.textAlign).toBe("right");
    expect(
      screen.getByTestId("member-access-back").props.style
    ).toBeDefined();
  });
});
