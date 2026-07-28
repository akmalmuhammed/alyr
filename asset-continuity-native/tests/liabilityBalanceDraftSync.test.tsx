import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";

import type {
  NativeLiability,
  NativeWorkspace
} from "@/domain/model";
import {
  portfolioMinorUnitsToInput,
  type PortfolioValueRecord
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import { getPortfolioExperienceCopy } from "@/i18n/portfolioCopy";

const LIABILITY_ID = "liability-home";
const mockRecordPortfolioValue = jest.fn();
const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  replace: jest.fn()
};
const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn()
};

const BASE_LIABILITY: NativeLiability = {
  id: LIABILITY_ID,
  householdId: "household-personal",
  version: 1,
  name: "Home finance",
  kind: "mortgage",
  lifecycleStatus: "active",
  archivedAt: null,
  syncStatus: "synced",
  createdAt: "2026-07-20T08:00:00.000Z",
  updatedAt: "2026-07-20T08:00:00.000Z"
};

const BASE_BALANCE: PortfolioValueRecord = {
  id: "balance-base",
  householdId: BASE_LIABILITY.householdId,
  subject: {
    kind: "liability",
    liabilityId: LIABILITY_ID
  },
  liabilityId: LIABILITY_ID,
  version: 1,
  amountMinor: 100_000,
  currency: "QAR",
  asOf: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T08:00:00.000Z",
  source: "user-entered",
  syncStatus: "synced"
};

const REMOTE_BALANCE: PortfolioValueRecord = {
  ...BASE_BALANCE,
  id: "balance-remote",
  version: 1,
  amountMinor: 240_050,
  currency: "USD",
  asOf: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T09:00:00.000Z"
};

function workspaceWith(
  balances: readonly PortfolioValueRecord[]
): NativeWorkspace {
  const workspace = createWorkspace(
    "personal",
    "2026-07-28T08:00:00.000Z"
  );
  return {
    ...workspace,
    household: {
      ...workspace.household,
      id: BASE_LIABILITY.householdId
    },
    liabilities: [BASE_LIABILITY],
    portfolioValueRecords: [...balances]
  };
}

let mockWorkspace = workspaceWith([BASE_BALANCE]);

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({
    liabilityId: LIABILITY_ID
  }),
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter
}));

jest.mock("@/i18n/coreJourneyCopy", () => {
  const actual = jest.requireActual("@/i18n/coreJourneyCopy");
  return {
    ...actual,
    useCoreJourneyCopy: () => ({
      language: "en",
      rtl: false
    })
  };
});

jest.mock("@/privacy/PortfolioPrivacyProvider", () => ({
  usePortfolioPrivacy: () => ({
    amountsHidden: true
  })
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: (capability: string) => capability === "liability.write",
    clearError: jest.fn(),
    error: null,
    recordPortfolioValue: mockRecordPortfolioValue,
    saving: false,
    workspace: mockWorkspace
  })
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    })
  };
});

import LiabilityBalanceRoute from "../app/liability-balance";

describe("Liability balance draft synchronization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspace = workspaceWith([BASE_BALANCE]);
    mockRecordPortfolioValue.mockResolvedValue(REMOTE_BALANCE);
  });

  it("adopts a newer balance while the editor remains pristine", async () => {
    const screen = await render(<LiabilityBalanceRoute />);

    mockWorkspace = workspaceWith([BASE_BALANCE, REMOTE_BALANCE]);
    await screen.rerender(<LiabilityBalanceRoute />);

    await waitFor(() => {
      expect(screen.getByTestId("liability-amount").props.value).toBe(
        portfolioMinorUnitsToInput(
          REMOTE_BALANCE.amountMinor,
          REMOTE_BALANCE.currency
        )
      );
    });
    expect(screen.getByTestId("liability-as-of").props.value).toBe(
      "2026-07-22"
    );
    expect(
      screen.queryByTestId("liability-balance-concurrent-update")
    ).toBeNull();
    expect(screen.getByTestId("liability-balance-save")).toBeDisabled();
    await screen.unmount();
  });

  it("preserves a dirty draft, announces the update, and blocks ordinary save", async () => {
    const copy = getPortfolioExperienceCopy("en");
    const screen = await render(<LiabilityBalanceRoute />);
    await fireEvent.changeText(
      screen.getByTestId("liability-amount"),
      "1500"
    );

    mockWorkspace = workspaceWith([BASE_BALANCE, REMOTE_BALANCE]);
    await screen.rerender(<LiabilityBalanceRoute />);

    await waitFor(() => {
      expect(
        screen.getByTestId("liability-balance-concurrent-update")
      ).toBeTruthy();
    });
    expect(screen.getByTestId("liability-amount").props.value).toBe("1500");
    expect(
      screen.getByRole("alert", {
        name: copy.balance.concurrentUpdateTitle
      })
    ).toBeTruthy();
    expect(screen.getByTestId("liability-balance-save")).toBeDisabled();

    await fireEvent.press(screen.getByTestId("liability-balance-save"));
    expect(mockRecordPortfolioValue).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("loads the newer balance without persisting the preserved draft", async () => {
    const screen = await render(<LiabilityBalanceRoute />);
    await fireEvent.changeText(
      screen.getByTestId("liability-amount"),
      "1500"
    );
    mockWorkspace = workspaceWith([BASE_BALANCE, REMOTE_BALANCE]);
    await screen.rerender(<LiabilityBalanceRoute />);
    await waitFor(() =>
      expect(
        screen.getByTestId("liability-balance-concurrent-update")
      ).toBeTruthy()
    );

    await fireEvent.press(
      screen.getByTestId("liability-balance-load-concurrent")
    );

    expect(screen.getByTestId("liability-amount").props.value).toBe(
      portfolioMinorUnitsToInput(
        REMOTE_BALANCE.amountMinor,
        REMOTE_BALANCE.currency
      )
    );
    expect(
      screen.queryByTestId("liability-balance-concurrent-update")
    ).toBeNull();
    expect(screen.getByTestId("liability-balance-save")).toBeDisabled();
    expect(mockRecordPortfolioValue).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("records the preserved draft only after explicit confirmation", async () => {
    const screen = await render(<LiabilityBalanceRoute />);
    await fireEvent.changeText(
      screen.getByTestId("liability-amount"),
      "1500"
    );
    mockWorkspace = workspaceWith([BASE_BALANCE, REMOTE_BALANCE]);
    await screen.rerender(<LiabilityBalanceRoute />);
    await waitFor(() =>
      expect(
        screen.getByTestId("liability-balance-confirm-replace")
      ).toBeTruthy()
    );

    await fireEvent.press(
      screen.getByTestId("liability-balance-confirm-replace")
    );

    expect(
      screen.getByTestId("liability-balance-replace-confirmed")
    ).toBeTruthy();
    expect(screen.getByTestId("liability-balance-save")).toBeEnabled();
    await fireEvent.press(screen.getByTestId("liability-balance-save"));

    await waitFor(() => {
      expect(mockRecordPortfolioValue).toHaveBeenCalledWith({
        liabilityId: LIABILITY_ID,
        amountMinor: 150_000,
        currency: "QAR",
        asOf: "2026-07-20"
      });
    });
    await screen.unmount();
  });
});
