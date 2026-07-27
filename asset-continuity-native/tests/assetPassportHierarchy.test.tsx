import { render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";

import AssetPassportScreen, {
  ASSET_PASSPORT_COPY
} from "../app/asset/[id]";
import type { NativeAsset, NativeWorkspace } from "@/domain/model";
import type { PortfolioValueRecord } from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { PortfolioPrivacyProvider } from "@/privacy/PortfolioPrivacyProvider";

let mockLanguage: "en" | "ar" = "en";
let mockWorkspaceContext: Record<string, unknown>;

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn()
};

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = require("react") as typeof import("react");
    useEffect(callback, []);
  },
  useLocalSearchParams: () => ({
    id: "asset-passport-hierarchy",
    justCreated: "1"
  }),
  useRouter: () => mockRouter
}));

jest.mock("@/components/AttachmentViewer", () => ({
  useAttachmentPreview: () => ({ status: "idle" })
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => mockWorkspaceContext
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native") as typeof import("react-native");
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

const asset: NativeAsset = {
  id: "asset-passport-hierarchy",
  version: 1,
  householdId: "00000000-0000-4000-8000-000000000010",
  name: "Passport hierarchy item",
  categoryId: "lifestyle.watch",
  categoryLabel: "Watch",
  visualKind: "watch",
  photoUri: null,
  photoProtectedUri: null,
  photoChecksumSha256: null,
  photoEvidenceId: null,
  locationStatus: "unknown",
  placeId: null,
  roomId: null,
  locatorText: null,
  evidenceIds: [],
  lifecycleStatus: "active",
  archivedAt: null,
  syncStatus: "on-device",
  createdAt: "2026-07-27T09:00:00.000Z",
  updatedAt: "2026-07-27T09:00:00.000Z"
};

function wrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider initialLanguage={mockLanguage}>
      <PortfolioPrivacyProvider scope={{ kind: "device-preview" }}>
        {children}
      </PortfolioPrivacyProvider>
    </LocaleProvider>
  );
}

function renderedTestIds(node: unknown): string[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(renderedTestIds);
  if (typeof node !== "object") return [];

  const element = node as {
    readonly props?: { readonly testID?: unknown };
    readonly children?: readonly unknown[];
  };
  const ownTestId =
    typeof element.props?.testID === "string"
      ? [element.props.testID]
      : [];
  return [
    ...ownTestId,
    ...(element.children?.flatMap(renderedTestIds) ?? [])
  ];
}

function createContext(
  recordedAssetValues: readonly PortfolioValueRecord[] = []
) {
  const personal = createWorkspace(
    "personal",
    "2026-07-27T09:00:00.000Z"
  );
  const workspace: NativeWorkspace = {
    ...personal,
    language: mockLanguage,
    assets: [asset]
  };

  return {
    attachmentStore: {},
    can: () => true,
    clearError: jest.fn(),
    error: null,
    pendingOperationCount: 0,
    recordedAssetValues,
    repository: { encryptedAtRest: false },
    saving: false,
    setAssetLifecycle: jest.fn(async () => undefined),
    sync: {
      status: "local-only",
      conflicts: [],
      lastError: null,
      lastAttemptAt: null,
      lastSyncedAt: null
    },
    workspace
  };
}

describe("Asset Passport post-save hierarchy", () => {
  beforeEach(() => {
    mockLanguage = "en";
    mockWorkspaceContext = createContext();
    mockRouter.back.mockClear();
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
  });

  it("renders the first next action immediately after save truth and before retrieval and value", async () => {
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const relevantOrder = renderedTestIds(screen.toJSON()).filter(
      (testId) =>
        [
          "asset-passport-saved-confirmation",
          "sync-truth",
          "asset-passport-next-action",
          "asset-passport-retrieval-heading",
          "asset-passport-value-heading"
        ].includes(testId)
    );

    expect(relevantOrder).toEqual([
      "asset-passport-saved-confirmation",
      "sync-truth",
      "asset-passport-next-action",
      "asset-passport-retrieval-heading",
      "asset-passport-value-heading"
    ]);

    const nextAction = screen.getByTestId(
      "asset-passport-next-action"
    );
    expect(nextAction.props.accessibilityRole).toBe("button");
    expect(nextAction.props.accessibilityHint).toBe(
      ASSET_PASSPORT_COPY.en.missingHint(
        ASSET_PASSPORT_COPY.en.missingAction.photo
      )
    );
    expect(
      screen.getByText(ASSET_PASSPORT_COPY.en.missingAction.photo)
    ).toBeTruthy();
  });

  it("keeps the promoted next action mirrored and accessible in Arabic", async () => {
    mockLanguage = "ar";
    mockWorkspaceContext = createContext();
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const nextAction = screen.getByTestId(
      "asset-passport-next-action"
    );

    expect(StyleSheet.flatten(nextAction.props.style).flexDirection).toBe(
      "row-reverse"
    );
    expect(nextAction.props.accessibilityRole).toBe("button");
    expect(nextAction.props.accessibilityHint).toBe(
      ASSET_PASSPORT_COPY.ar.missingHint(
        ASSET_PASSPORT_COPY.ar.missingAction.photo
      )
    );
    expect(
      screen.getByText(ASSET_PASSPORT_COPY.ar.missingAction.photo)
    ).toBeTruthy();
  });

  it("masks a Passport value in both visible and assistive output by default", async () => {
    mockWorkspaceContext = createContext([
      {
        id: "asset-passport-value",
        assetId: asset.id,
        amountMinor: 123_450,
        currency: "QAR",
        asOf: "2026-07-27T00:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
        source: "user-entered"
      }
    ]);

    const screen = await render(<AssetPassportScreen />, { wrapper });

    expect(
      screen.getByText("QAR \u2022\u2022\u2022\u2022\u2022\u2022")
    ).toBeTruthy();
    expect(screen.queryByText(/QAR\s*1,234\.50/u)).toBeNull();
    expect(
      screen.getByLabelText(
        /Recorded asset value, QAR, recorded amount hidden/u
      )
    ).toBeTruthy();
    expect(
      screen.queryByLabelText(/Recorded asset value.+1,234\.50/u)
    ).toBeNull();
  });
});
