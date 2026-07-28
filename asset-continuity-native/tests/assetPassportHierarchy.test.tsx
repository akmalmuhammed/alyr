import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Alert, StyleSheet } from "react-native";

import AssetPassportScreen, {
  ASSET_PASSPORT_COPY,
  assetRetrievalSourceFromRoute,
  shouldStackAssetPassportMasthead
} from "../app/asset/[id]";
import type {
  NativeAsset,
  NativePlace,
  NativeWorkspace
} from "@/domain/model";
import type { PortfolioValueRecord } from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { PortfolioPrivacyProvider } from "@/privacy/PortfolioPrivacyProvider";
import { colors } from "@/theme/tokens";

let mockLanguage: "en" | "ar" = "en";
let mockWorkspaceContext: Record<string, unknown>;
let mockParams: {
  id: string;
  justCreated?: string;
  retrievalSource?: string | string[];
} = {
  id: "asset-passport-hierarchy",
  justCreated: "1"
};
const mockMarkRetrieved = jest.fn(async () => undefined);
const mockPlayTactileFeedback = jest.fn<
  Promise<void>,
  [string, { readonly reduceMotion: boolean }]
>(async () => undefined);

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
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter
}));

jest.mock("@/components/AttachmentViewer", () => ({
  useAttachmentPreview: () => ({ status: "idle" })
}));

jest.mock("@/accessibility/useReduceMotionPreference", () => ({
  useReduceMotionPreference: () => false
}));

jest.mock("@/feedback/tactileFeedback", () => ({
  __esModule: true,
  playTactileFeedback: (
    kind: string,
    options: { readonly reduceMotion: boolean }
  ) => mockPlayTactileFeedback(kind, options)
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
  recordedAssetValues: readonly PortfolioValueRecord[] = [],
  workspaceOverride: Partial<NativeWorkspace> = {}
) {
  const personal = createWorkspace(
    "personal",
    "2026-07-27T09:00:00.000Z"
  );
  const workspace: NativeWorkspace = {
    ...personal,
    language: mockLanguage,
    assets: [asset],
    ...workspaceOverride
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
    markRetrieved: mockMarkRetrieved,
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

function locatedContext(
  placeOverride: Partial<NativePlace>
): Record<string, unknown> {
  const sample = createWorkspace("sample");
  const sourcePlace = sample.places.find(
    (item) => item.id === "place-west-bay"
  )!;
  const place: NativePlace = {
    ...sourcePlace,
    id: "asset-passport-place",
    ...placeOverride
  };
  const locatedAsset: NativeAsset = {
    ...asset,
    locationStatus: "known",
    placeId: place.id,
    roomId: place.rooms[0]!.id,
    locatorText: "Upper drawer"
  };

  return createContext([], {
    assets: [locatedAsset],
    places: [place]
  });
}

function completeContext(): Record<string, unknown> {
  const sample = createWorkspace("sample");
  const place = sample.places.find(
    (item) => item.id === "place-west-bay"
  )!;
  const sourceEvidence = sample.evidence[0]!;
  const evidence = {
    ...sourceEvidence,
    id: "asset-passport-complete-proof",
    assetId: asset.id
  };
  const completedAsset: NativeAsset = {
    ...asset,
    photoUri: "file:///protected/asset-passport-complete.jpg",
    locationStatus: "known",
    placeId: place.id,
    roomId: place.rooms[0]!.id,
    locatorText: "Upper drawer",
    evidenceIds: [evidence.id]
  };

  return createContext([], {
    assets: [completedAsset],
    evidence: [evidence],
    places: [place]
  });
}

function documentContext(): Record<string, unknown> {
  return createContext([], {
    assets: [
      {
        ...asset,
        name: "Family certificate",
        categoryId: "document.important",
        categoryLabel: "Important document",
        visualKind: "digital",
        locationStatus: "known",
        placeId: null,
        roomId: null,
        locatorText: null
      }
    ]
  });
}

describe("Asset Passport post-save hierarchy", () => {
  beforeEach(() => {
    mockLanguage = "en";
    mockParams = {
      id: "asset-passport-hierarchy",
      justCreated: "1"
    };
    mockWorkspaceContext = createContext();
    mockRouter.back.mockClear();
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockMarkRetrieved.mockClear();
    mockPlayTactileFeedback.mockClear();
  });

  it("keeps first-Passport success focused on Today, another item, then the full Passport", async () => {
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const relevantOrder = renderedTestIds(screen.toJSON()).filter(
      (testId) =>
        [
           "asset-passport-saved-confirmation",
           "asset-passport-primary-action",
           "asset-passport-add-another-action",
           "asset-passport-view-action",
           "sync-truth",
          "asset-passport-retrieval-heading",
          "asset-passport-value-heading"
        ].includes(testId)
    );

    expect(relevantOrder).toEqual([
       "asset-passport-saved-confirmation",
       "asset-passport-primary-action",
       "asset-passport-add-another-action",
       "asset-passport-view-action",
      "sync-truth"
    ]);
    expect(
      screen.getByText(ASSET_PASSPORT_COPY.en.startedTitle)
    ).toBeTruthy();
    expect(
      screen.getByText(ASSET_PASSPORT_COPY.en.startedMeta)
    ).toBeTruthy();
    expect(
      screen.queryByText(ASSET_PASSPORT_COPY.en.savedMeta)
    ).toBeNull();

    expect(
      screen.queryByText(ASSET_PASSPORT_COPY.en.addRecordedValue)
    ).toBeNull();
    await fireEvent.press(
      screen.getByText(ASSET_PASSPORT_COPY.en.goToToday)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
    expect(mockRouter.push).not.toHaveBeenCalledWith(
      expect.stringContaining("/asset-value")
    );

    expect(
      screen.getByRole("button", {
        name: ASSET_PASSPORT_COPY.en.addAnotherItem
      }).props.accessibilityHint
    ).toBe(ASSET_PASSPORT_COPY.en.addAnotherItemHint);
    await fireEvent.press(
      screen.getByText(ASSET_PASSPORT_COPY.en.addAnotherItem)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith("/capture");

    await fireEvent.press(
      screen.getByText(ASSET_PASSPORT_COPY.en.viewPassport)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/asset/asset-passport-hierarchy"
    );
    expect(
      screen.queryByTestId("asset-passport-retrieval-heading")
    ).toBeNull();
    expect(
      screen.queryByTestId("asset-passport-value-heading")
    ).toBeNull();
  });

  it("uses one ruled documentary masthead and a non-card confirmation band", async () => {
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const mastheadStyle = StyleSheet.flatten(
      screen.getByTestId("asset-passport-masthead").props.style
    );
    const confirmationStyle = StyleSheet.flatten(
      screen.getByTestId("asset-passport-saved-confirmation").props
        .style
    );

    expect(mastheadStyle).toMatchObject({
      borderTopWidth: 2,
      borderTopColor: colors.carbon
    });
    expect(mastheadStyle.borderRadius).toBeUndefined();
    expect(
      screen.getByTestId("asset-passport-masthead-media")
    ).toBeTruthy();
    expect(
      screen.getByTestId("asset-passport-masthead-identity")
    ).toBeTruthy();
    expect(
      screen.getByTestId("asset-passport-category-field")
    ).toBeTruthy();
    expect(
      screen.getByTestId("asset-passport-status-field")
    ).toBeTruthy();
    expect(
      screen.getByTestId("asset-passport-created-field")
    ).toBeTruthy();
    expect(
      screen.getByTestId("asset-passport-record-field")
    ).toBeTruthy();

    expect(confirmationStyle).toMatchObject({
      borderTopWidth: 2,
      borderBottomWidth: 1,
      borderColor: colors.carbon
    });
    expect(confirmationStyle.borderRadius).toBeUndefined();
    expect(confirmationStyle.backgroundColor).toBeUndefined();
  });

  it("stacks the masthead at 320 points and for larger Dynamic Type", () => {
    expect(shouldStackAssetPassportMasthead(320, 1)).toBe(true);
    expect(shouldStackAssetPassportMasthead(390, 1)).toBe(false);
    expect(shouldStackAssetPassportMasthead(390, 1.5)).toBe(true);
    expect(shouldStackAssetPassportMasthead(768, 1.8)).toBe(true);
  });

  it("keeps the Today-first hierarchy mirrored and accessible in Arabic", async () => {
    mockLanguage = "ar";
    mockWorkspaceContext = createContext();
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const nextActionLabel = screen.getByText(
      ASSET_PASSPORT_COPY.ar.goToToday
    );
    const nextActionContent = nextActionLabel.parent;

    expect(
      screen.getByText(ASSET_PASSPORT_COPY.ar.startedTitle)
    ).toBeTruthy();
    expect(
      screen.getByText(ASSET_PASSPORT_COPY.ar.startedMeta)
    ).toBeTruthy();
    expect(
      screen.queryByText(ASSET_PASSPORT_COPY.ar.savedMeta)
    ).toBeNull();
    expect(
      StyleSheet.flatten(nextActionContent?.props.style).flexDirection
    ).toBe("row-reverse");
    await fireEvent.press(nextActionLabel);
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
    expect(
      screen.queryByText(ASSET_PASSPORT_COPY.ar.addRecordedValue)
    ).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalledWith(
      expect.stringContaining("/asset-value")
    );
  });

  it("preserves the complete-record receipt only when every readiness item is complete", async () => {
    mockWorkspaceContext = completeContext();
    const screen = await render(<AssetPassportScreen />, { wrapper });

    expect(
      screen.getByText(ASSET_PASSPORT_COPY.en.savedTitle)
    ).toBeTruthy();
    expect(
      screen.getByText(ASSET_PASSPORT_COPY.en.savedMeta)
    ).toBeTruthy();
    expect(
      screen.queryByText(ASSET_PASSPORT_COPY.en.startedMeta)
    ).toBeNull();
    await screen.unmount();
  });

  it("keeps Today primary when the item already has a recorded value", async () => {
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
      screen.queryByText(ASSET_PASSPORT_COPY.en.addRecordedValue)
    ).toBeNull();
    await fireEvent.press(
      screen.getByText(ASSET_PASSPORT_COPY.en.goToToday)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
  });

  it("preserves read-only permissions without withholding Today or the saved Passport", async () => {
    mockWorkspaceContext = {
      ...createContext(),
      can: () => false
    };
    const screen = await render(<AssetPassportScreen />, { wrapper });

    expect(
      screen.getByRole("button", {
        name: ASSET_PASSPORT_COPY.en.goToToday
      }).props.accessibilityHint
    ).toBe(ASSET_PASSPORT_COPY.en.todayHint);
    expect(
      screen.queryByText(ASSET_PASSPORT_COPY.en.addAnotherItem)
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: ASSET_PASSPORT_COPY.en.viewPassport
      })
    ).toBeTruthy();
    expect(screen.getByTestId("sync-truth")).toBeTruthy();

    await fireEvent.press(
      screen.getByText(ASSET_PASSPORT_COPY.en.goToToday)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
  });

  it("keeps an important document out of value CTAs and editor access", async () => {
    mockWorkspaceContext = documentContext();
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const action = screen.getByRole("button", {
      name: ASSET_PASSPORT_COPY.en.goToToday
    });

    expect(
      screen.queryByText(ASSET_PASSPORT_COPY.en.addRecordedValue)
    ).toBeNull();
    expect(
      screen.queryByTestId("asset-passport-value-heading")
    ).toBeNull();
    expect(action.props.accessibilityHint).toBe(
      ASSET_PASSPORT_COPY.en.todayHint
    );

    await fireEvent.press(action);
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
    expect(mockRouter.push).not.toHaveBeenCalledWith(
      expect.stringContaining("/asset-value")
    );
  });

  it("mirrors the document-safe post-save action in Arabic", async () => {
    mockLanguage = "ar";
    mockWorkspaceContext = documentContext();
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const action = screen.getByRole("button", {
      name: ASSET_PASSPORT_COPY.ar.goToToday
    });

    expect(action.props.accessibilityHint).toBe(
      ASSET_PASSPORT_COPY.ar.todayHint
    );
    expect(
      StyleSheet.flatten(action.props.style).minHeight
    ).toBeGreaterThanOrEqual(44);
    expect(
      screen.queryByText(ASSET_PASSPORT_COPY.ar.valueTitle)
    ).toBeNull();

    await fireEvent.press(action);
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
  });

  it("keeps the first missing action primary while exposing corrections for completed details", async () => {
    mockParams = { id: "asset-passport-hierarchy" };
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const initialOrder = renderedTestIds(screen.toJSON()).filter(
      (testId) =>
        testId === "asset-passport-next-action" ||
        testId === "asset-passport-edit-details"
    );

    expect(initialOrder).toEqual([
      "asset-passport-next-action",
      "asset-passport-edit-details"
    ]);
    expect(
      screen.getByTestId("asset-passport-edit-details").props
        .accessibilityState
    ).toEqual({ expanded: false });
    expect(
      screen.queryByText(ASSET_PASSPORT_COPY.en.updateIdentity)
    ).toBeNull();

    await fireEvent.press(
      screen.getByTestId("asset-passport-edit-details")
    );

    expect(
      screen.getByTestId("asset-passport-edit-details").props
        .accessibilityState
    ).toEqual({ expanded: true });
    expect(
      screen.getByText(ASSET_PASSPORT_COPY.en.missingAction.photo)
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByText(ASSET_PASSPORT_COPY.en.updateIdentity)
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/asset-edit?assetId=asset-passport-hierarchy&focus=identity&returnTo=passport"
    );
  });

  it("adds optional destructive feedback only after archive is durably confirmed", async () => {
    mockParams = { id: "asset-passport-hierarchy" };
    let resolveLifecycle!: () => void;
    const setAssetLifecycle = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLifecycle = resolve;
        })
    );
    mockWorkspaceContext = {
      ...createContext(),
      setAssetLifecycle
    };
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, _message, buttons) => {
        if (title !== ASSET_PASSPORT_COPY.en.archiveAlertTitle) return;
        buttons
          ?.find(
            (button) =>
              button.text === ASSET_PASSPORT_COPY.en.archivePassport
          )
          ?.onPress?.();
      });

    try {
      const screen = await render(<AssetPassportScreen />, { wrapper });
      await fireEvent.press(
        screen.getByTestId("asset-passport-edit-details")
      );
      await fireEvent.press(
        screen.getByRole("button", {
          name: ASSET_PASSPORT_COPY.en.archiveAction
        })
      );

      await waitFor(() =>
        expect(setAssetLifecycle).toHaveBeenCalledWith({
          assetId: asset.id,
          lifecycleStatus: "archived"
        })
      );
      expect(mockPlayTactileFeedback).not.toHaveBeenCalled();

      resolveLifecycle();

      await waitFor(() =>
        expect(mockPlayTactileFeedback).toHaveBeenCalledWith(
          "destructive",
          { reduceMotion: false }
        )
      );
      expect(mockRouter.replace).toHaveBeenCalledWith(
        "/assets?view=items&filter=archived"
      );
    } finally {
      alertSpy.mockRestore();
    }
  });

  it("discloses that an unconfirmed GPS pin still needs confirmation", async () => {
    mockParams = { id: "asset-passport-hierarchy" };
    mockWorkspaceContext = locatedContext({
      locationSource: "device_gps",
      precision: "exact",
      horizontalAccuracyMeters: 6.8,
      confirmedAt: null
    });

    const screen = await render(<AssetPassportScreen />, { wrapper });

    expect(
      screen.getByText("GPS pin · confirmation needed")
    ).toBeTruthy();
    const action = screen.getByRole("button", {
      name: new RegExp(
        `^${ASSET_PASSPORT_COPY.en.confirmPlacePin}`
      )
    });
    expect(action.props.accessibilityLabel).toContain(
      ASSET_PASSPORT_COPY.en.confirmPlacePinMeta
    );
    expect(action.props.accessibilityHint).toBe(
      ASSET_PASSPORT_COPY.en.confirmPlacePinHint
    );

    await fireEvent.press(action);
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/place-pin?placeId=asset-passport-place"
    );
  });

  it("localizes confirmation-needed truth for an adjusted pin", async () => {
    mockLanguage = "ar";
    mockParams = { id: "asset-passport-hierarchy" };
    mockWorkspaceContext = locatedContext({
      locationSource: "user_pin",
      precision: "user_placed",
      horizontalAccuracyMeters: null,
      confirmedAt: null
    });

    const screen = await render(<AssetPassportScreen />, { wrapper });

    expect(
      screen.getByText("دبوس موضوع يدويًا · يحتاج إلى تأكيد")
    ).toBeTruthy();
    const action = screen.getByRole("button", {
      name: new RegExp(
        `^${ASSET_PASSPORT_COPY.ar.confirmPlacePin}`
      )
    });
    expect(action.props.accessibilityLabel).toContain(
      ASSET_PASSPORT_COPY.ar.confirmPlacePinMeta
    );
    expect(action.props.accessibilityHint).toBe(
      ASSET_PASSPORT_COPY.ar.confirmPlacePinHint
    );

    await fireEvent.press(action);
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/place-pin?placeId=asset-passport-place"
    );
  });

  it("records a confirmed retrieval with the actual search entry source", async () => {
    mockParams = {
      id: "asset-passport-hierarchy",
      retrievalSource: "search"
    };
    mockWorkspaceContext = locatedContext({
      locationSource: "user_pin",
      precision: "user_placed",
      horizontalAccuracyMeters: null,
      confirmedAt: "2026-07-27T09:00:00.000Z"
    });
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, _message, buttons) => {
        if (title !== ASSET_PASSPORT_COPY.en.retrievalConfirmTitle) {
          return;
        }
        buttons
          ?.find(
            (button) =>
              button.text ===
              ASSET_PASSPORT_COPY.en.retrievalConfirmSubmit
          )
          ?.onPress?.();
      });

    try {
      const screen = await render(<AssetPassportScreen />, { wrapper });
      const action = screen.getByText(
        ASSET_PASSPORT_COPY.en.retrievalConfirmAction
      );

      expect(
        screen.getByTestId("asset-passport-retrieval-confirm")
      ).toBeTruthy();
      expect(action.parent?.props.accessibilityHint).toBe(
        ASSET_PASSPORT_COPY.en.retrievalConfirmHint
      );

      await fireEvent.press(action);
      await waitFor(() =>
        expect(mockMarkRetrieved).toHaveBeenCalledWith(
          "asset-passport-hierarchy",
          "search"
        )
      );
    } finally {
      alertSpy.mockRestore();
    }
  });

  it("presents retrieval as an edge-to-edge Place, Space, Locator sequence with an explicit open disclosure", async () => {
    mockParams = { id: "asset-passport-hierarchy" };
    mockWorkspaceContext = locatedContext({
      locationSource: "user_pin",
      precision: "user_placed",
      horizontalAccuracyMeters: null,
      confirmedAt: "2026-07-27T09:00:00.000Z"
    });
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const locatorOrder = renderedTestIds(screen.toJSON()).filter(
      (testId) =>
        [
          "asset-passport-retrieval-strip",
          "asset-passport-locator-place",
          "asset-passport-locator-space",
          "asset-passport-locator-detail",
          "asset-passport-open-place"
        ].includes(testId)
    );
    const stripStyle = StyleSheet.flatten(
      screen.getByTestId("asset-passport-retrieval-strip").props.style
    );
    const openPlace = screen.getByTestId(
      "asset-passport-open-place"
    );

    expect(locatorOrder).toEqual([
      "asset-passport-retrieval-strip",
      "asset-passport-locator-place",
      "asset-passport-locator-space",
      "asset-passport-locator-detail",
      "asset-passport-open-place"
    ]);
    expect(stripStyle).toMatchObject({
      marginHorizontal: -20,
      paddingHorizontal: 20,
      backgroundColor: colors.carbon
    });
    expect(stripStyle.borderRadius).toBeUndefined();
    expect(
      screen.getByText(ASSET_PASSPORT_COPY.en.openDisclosure)
    ).toBeTruthy();
    expect(openPlace.props.accessibilityRole).toBe("button");
    expect(openPlace.props.accessibilityLabel).toContain(
      "West Bay Home"
    );

    await fireEvent.press(openPlace);
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/place/asset-passport-place"
    );
  });

  it("mirrors locator rows and the open disclosure in Arabic without reordering the retrieval sequence", async () => {
    mockLanguage = "ar";
    mockParams = { id: "asset-passport-hierarchy" };
    mockWorkspaceContext = locatedContext({
      locationSource: "user_pin",
      precision: "user_placed",
      horizontalAccuracyMeters: null,
      confirmedAt: "2026-07-27T09:00:00.000Z"
    });
    const screen = await render(<AssetPassportScreen />, { wrapper });
    const placeRow = screen.getByTestId("asset-passport-locator-place");
    const openPlace = screen.getByTestId(
      "asset-passport-open-place"
    );
    const locatorOrder = renderedTestIds(screen.toJSON()).filter(
      (testId) =>
        [
          "asset-passport-locator-place",
          "asset-passport-locator-space",
          "asset-passport-locator-detail"
        ].includes(testId)
    );

    expect(locatorOrder).toEqual([
      "asset-passport-locator-place",
      "asset-passport-locator-space",
      "asset-passport-locator-detail"
    ]);
    expect(StyleSheet.flatten(placeRow.props.style).flexDirection).toBe(
      "row-reverse"
    );
    expect(
      StyleSheet.flatten(openPlace.props.style).flexDirection
    ).toBe("row-reverse");
    expect(
      screen.getByText(ASSET_PASSPORT_COPY.ar.openDisclosure)
    ).toBeTruthy();
  });

  it("uses a localized retrieval action and a bounded deep-link fallback", async () => {
    expect(assetRetrievalSourceFromRoute(undefined)).toBe("deep-link");
    expect(assetRetrievalSourceFromRoute("unexpected")).toBe(
      "deep-link"
    );
    expect(assetRetrievalSourceFromRoute(["place-view"])).toBe(
      "place-view"
    );

    mockLanguage = "ar";
    mockParams = { id: "asset-passport-hierarchy" };
    mockWorkspaceContext = locatedContext({
      locationSource: "user_pin",
      precision: "user_placed",
      horizontalAccuracyMeters: null,
      confirmedAt: "2026-07-27T09:00:00.000Z"
    });
    const screen = await render(<AssetPassportScreen />, { wrapper });

    expect(
      screen.getByText(
        ASSET_PASSPORT_COPY.ar.retrievalConfirmAction
      )
    ).toBeTruthy();
  });

  it("masks a Passport value in both visible and assistive output by default", async () => {
    mockParams = { id: "asset-passport-hierarchy" };
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
