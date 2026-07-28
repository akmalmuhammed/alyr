import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AssetValueRoute from "../app/asset-value";
import type { NativeWorkspace } from "@/domain/model";
import type { PortfolioValueRecord } from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { PortfolioPrivacyProvider } from "@/privacy/PortfolioPrivacyProvider";
import { formatRecordedValue } from "@/privacy/ValueVisibility";

let mockLanguage: "en" | "ar" = "en";
let mockCanWrite = true;
let mockReturnTo = "passport";
const mockRecordPortfolioValue = jest.fn(async () => undefined);
const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn()
};
const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn()
};

const personal = createWorkspace("personal");
const sampleAsset = createWorkspace("sample").assets[0]!;
const mockAsset = {
  ...sampleAsset,
  householdId: personal.household.id
};
const mockValues: readonly PortfolioValueRecord[] = [
  {
    id: "value-current",
    assetId: mockAsset.id,
    amountMinor: 675_000_000,
    currency: "QAR",
    asOf: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    source: "user-entered"
  },
  {
    id: "value-previous",
    assetId: mockAsset.id,
    amountMinor: 650_000_000,
    currency: "QAR",
    asOf: "2026-06-27T00:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
    source: "user-entered"
  }
];
const mockWorkspace: NativeWorkspace = {
  ...personal,
  language: mockLanguage,
  assets: [mockAsset],
  portfolioValueRecords: [...mockValues]
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({
    assetId: mockAsset.id,
    returnTo: mockReturnTo
  }),
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: () => mockCanWrite,
    clearError: jest.fn(),
    error: null,
    recordPortfolioValue: mockRecordPortfolioValue,
    recordedPortfolioValues: mockValues,
    repository: {
      durable: true,
      encryptedAtRest: true
    },
    saving: false,
    workspace: {
      ...mockWorkspace,
      language: mockLanguage
    }
  })
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 }
};

function wrapper({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <LocaleProvider initialLanguage={mockLanguage}>
        <PortfolioPrivacyProvider scope={{ kind: "device-preview" }}>
          {children}
        </PortfolioPrivacyProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}

describe("recorded value editor privacy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = "en";
    mockCanWrite = true;
    mockReturnTo = "passport";
  });

  it("masks the current entry, editable field and complete history by default", async () => {
    const screen = await render(<AssetValueRoute />, { wrapper });
    const visibleCurrent = formatRecordedValue({
      amountMinor: mockValues[0]!.amountMinor,
      currency: mockValues[0]!.currency,
      language: "en",
      visibility: "visible"
    }).text;
    const visiblePrevious = formatRecordedValue({
      amountMinor: mockValues[1]!.amountMinor,
      currency: mockValues[1]!.currency,
      language: "en",
      visibility: "visible"
    }).text;

    expect(
      screen.getAllByText("QAR \u2022\u2022\u2022\u2022\u2022\u2022").length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(visibleCurrent)).toBeNull();
    expect(screen.queryByText(visiblePrevious)).toBeNull();

    const amountField = screen.getByLabelText("Amount");
    expect(amountField.props.secureTextEntry).toBe(true);

    const hiddenLabels = screen.getAllByLabelText(
      /QAR, recorded amount hidden/u
    );
    expect(hiddenLabels.length).toBeGreaterThanOrEqual(3);
    expect(
      hiddenLabels.some((node) =>
        String(node.props.accessibilityLabel).includes("6,750,000")
      )
    ).toBe(false);
    expect(
      hiddenLabels.some((node) =>
        String(node.props.accessibilityLabel).includes("6,500,000")
      )
    ).toBe(false);
  });

  it("keeps the same hidden boundary in Arabic without English fallback copy", async () => {
    mockLanguage = "ar";
    const screen = await render(<AssetValueRoute />, { wrapper });
    const visibleCurrent = formatRecordedValue({
      amountMinor: mockValues[0]!.amountMinor,
      currency: mockValues[0]!.currency,
      language: "ar",
      visibility: "visible"
    }).text;

    await waitFor(() => {
      expect(
        screen.getAllByText("QAR \u2022\u2022\u2022\u2022\u2022\u2022").length
      ).toBeGreaterThanOrEqual(2);
    });
    expect(screen.queryByText(visibleCurrent)).toBeNull();
    expect(
      screen
        .getAllByLabelText(/QAR.+[\u0600-\u06ff]/u)
        .some((node) =>
          String(node.props.accessibilityLabel).includes(
            "recorded amount hidden"
          )
        )
    ).toBe(false);
    expect(
      screen
        .getAllByLabelText(/[\u0600-\u06ff]/u)
        .filter((node) => node.props.secureTextEntry === true)
    ).toHaveLength(1);
  });

  it("honors the post-capture dashboard destination after recording the first value", async () => {
    mockReturnTo = "dashboard";
    const screen = await render(<AssetValueRoute />, { wrapper });

    await fireEvent.changeText(
      screen.getByLabelText("Amount"),
      "7000000"
    );
    const submitLabels = screen.getAllByText("Update recorded value");
    await fireEvent.press(submitLabels[submitLabels.length - 1]!);

    await waitFor(() => {
      expect(mockRecordPortfolioValue).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith("/dashboard");
    });
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
