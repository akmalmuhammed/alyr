import {
  fireEvent,
  render
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import PlaceScreen, {
  PLACE_DETAIL_COPY,
  placeCoordinateLabel,
  placeSectionTitle
} from "../app/place/[id]";
import {
  PLACE_DOCUMENT_COPY,
  PlaceDocumentRow,
  openPlaceDocument,
  placeDocumentCapturedDate,
  placeDocumentErrorMessage,
  placeDocumentFileSize,
  placeDocumentStorageState
} from "@/components/PlaceDocumentRow";
import type {
  NativePlaceDocument,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import { getCaptureCopy } from "@/i18n/captureCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { PortfolioPrivacyProvider } from "@/privacy/PortfolioPrivacyProvider";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn()
};
const sample = createWorkspace("sample");
const personal = createWorkspace("personal");
const mockDocument: NativePlaceDocument = {
  id: "place-document-1",
  versionId: "place-document-version-1",
  blobObjectId: "place-blob-1",
  householdId: personal.household.id,
  placeId: sample.places[0]!.id,
  fileName: "deed.pdf",
  mimeType: "application/pdf",
  byteSize: 1536,
  localUri: "file:///preview/deed.pdf",
  checksumSha256: null,
  encryptedAtRest: false,
  storageState: "on-device",
  capturedAt: "2026-07-27T10:00:00.000Z"
};
const mockWorkspace: NativeWorkspace = {
  ...personal,
  places: [
    {
      ...sample.places[0]!,
      householdId: personal.household.id,
      rooms: sample.places[0]!.rooms.slice(0, 2)
    }
  ],
  assets: [],
  evidence: [],
  placeDocuments: [mockDocument],
  portfolioValueRecords: [
    {
      id: "place-value-1",
      subject: {
        kind: "place",
        placeId: sample.places[0]!.id
      },
      placeId: sample.places[0]!.id,
      amountMinor: 675_000_000,
      currency: "QAR",
      asOf: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-27T10:00:00.000Z",
      source: "user-entered",
      syncStatus: "on-device"
    }
  ]
};
let mockActiveWorkspace: NativeWorkspace = mockWorkspace;
let mockCan = () => true;
let mockParams: { id: string; justCreated?: string } = {
  id: mockWorkspace.places[0]!.id,
  justCreated: "1"
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    addPlaceDocument: jest.fn(async () => undefined),
    attachmentStore: null,
    can: mockCan,
    clearError: jest.fn(),
    error: null,
    pendingOperationCount: 1,
    repository: {
      encryptedAtRest: false
    },
    saving: false,
    sync: {
      status: "local-only",
      conflicts: [],
      lastError: null,
      lastAttemptAt: null,
      lastSyncedAt: null
    },
    workspace: mockActiveWorkspace
  })
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 }
};

function localeWrapper(language: "en" | "ar") {
  return function TestLocaleWrapper({ children }: PropsWithChildren) {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <LocaleProvider initialLanguage={language}>
          <PortfolioPrivacyProvider scope={{ kind: "device-preview" }}>
            {children}
          </PortfolioPrivacyProvider>
        </LocaleProvider>
      </SafeAreaProvider>
    );
  };
}

describe("localized Place detail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveWorkspace = mockWorkspace;
    mockCan = () => true;
    mockParams = {
      id: mockWorkspace.places[0]!.id,
      justCreated: "1"
    };
  });

  it("keeps Place and document copy in complete English/Arabic parity", () => {
    expect(Object.keys(PLACE_DETAIL_COPY.ar).sort()).toEqual(
      Object.keys(PLACE_DETAIL_COPY.en).sort()
    );
    expect(Object.keys(PLACE_DOCUMENT_COPY.ar).sort()).toEqual(
      Object.keys(PLACE_DOCUMENT_COPY.en).sort()
    );
    expect(JSON.stringify(PLACE_DETAIL_COPY.ar)).toMatch(
      /[\u0600-\u06ff]/u
    );
    expect(JSON.stringify(PLACE_DOCUMENT_COPY.ar)).toMatch(
      /[\u0600-\u06ff]/u
    );
    expect(PLACE_DETAIL_COPY.en.documentTruth).not.toContain(
      "Cloud sync for Place documents is not active"
    );
    expect(PLACE_DETAIL_COPY.en.documentTruth).toContain(
      "waiting to upload"
    );
  });

  it("formats counts and dates for the selected locale and isolates coordinates", () => {
    expect(placeSectionTitle("الأغراض", 27, "ar")).toMatch(/[٢۲]/u);
    expect(placeDocumentFileSize(1536, "ar")).toMatch(/[٢۲]/u);
    expect(
      placeDocumentCapturedDate("2026-07-27T10:00:00.000Z", "ar")
    ).toMatch(/[\u0600-\u06ff]/u);
    expect(placeDocumentCapturedDate("bad-date", "ar")).toBe(
      PLACE_DOCUMENT_COPY.ar.dateNotReported
    );
    const protectedDocument = {
      ...mockDocument,
      encryptedAtRest: true,
      checksumSha256: "a".repeat(64)
    } satisfies NativePlaceDocument;
    expect(
      placeDocumentStorageState(
        { ...protectedDocument, storageState: "on-device" },
        "en"
      )
    ).toBe(
      `${PLACE_DOCUMENT_COPY.en.onDevice} · ${PLACE_DOCUMENT_COPY.en.encrypted}`
    );
    expect(
      placeDocumentStorageState(
        { ...protectedDocument, storageState: "queued" },
        "en"
      )
    ).toBe(
      `${PLACE_DOCUMENT_COPY.en.waitingToUpload} · ${PLACE_DOCUMENT_COPY.en.encrypted}`
    );
    expect(
      placeDocumentStorageState(
        { ...protectedDocument, storageState: "synced" },
        "en"
      )
    ).toBe(
      `${PLACE_DOCUMENT_COPY.en.synced} · ${PLACE_DOCUMENT_COPY.en.encrypted}`
    );
    expect(
      placeDocumentStorageState(
        { ...protectedDocument, localUri: null, storageState: "synced" },
        "en"
      )
    ).toBe(PLACE_DOCUMENT_COPY.en.originalUnavailable);
    expect(placeCoordinateLabel(25.321234, 51.531234)).toBe(
      "\u206625.321234, 51.531234\u2069"
    );
  });

  it("renders the Arabic Place receipt, sync truth, content and LTR coordinates", async () => {
    const screen = await render(<PlaceScreen />, {
      wrapper: localeWrapper("ar")
    });
    const copy = PLACE_DETAIL_COPY.ar;

    expect(screen.getByTestId("place-saved-receipt")).toBeTruthy();
    expect(screen.getByText(copy.savedTitle)).toBeTruthy();
    expect(
      screen.getByText(
        placeSectionTitle(copy.documents, 1, "ar")
      )
    ).toBeTruthy();
    expect(screen.queryByText(PLACE_DETAIL_COPY.en.savedTitle)).toBeNull();

    await fireEvent.press(
      screen.getAllByRole("button", { name: copy.addFirstItem })[0]!
    );
    expect(mockRouter.replace).toHaveBeenCalledWith(
      `/capture?placeId=${mockWorkspace.places[0]!.id}`
    );

    await fireEvent.press(
      screen.getByRole("button", { name: copy.goToToday })
    );
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");

    await fireEvent.press(screen.getByTestId("sync-truth"));
    expect(mockRouter.push).toHaveBeenCalledWith("/vault");

    const coordinates = placeCoordinateLabel(
      mockWorkspace.places[0]!.latitude!,
      mockWorkspace.places[0]!.longitude!
    );
    const coordinateStyle = StyleSheet.flatten(
      screen.getByText(coordinates).props.style
    );
    expect(coordinateStyle.writingDirection).toBe("ltr");
    expect(coordinateStyle.textAlign).toBe("right");
  });

  it("keeps the saved Place receipt useful for a view-only member", async () => {
    mockCan = (capability?: string) => capability !== "asset.write";
    const screen = await render(<PlaceScreen />, {
      wrapper: localeWrapper("en")
    });

    expect(
      screen.queryByRole("button", {
        name: PLACE_DETAIL_COPY.en.addFirstItem
      })
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", {
        name: PLACE_DETAIL_COPY.en.goToToday
      })
    );
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
  });

  it("renders a document row in Arabic with one RTL layout strategy", async () => {
    const screen = await render(
      <PlaceDocumentRow document={mockDocument} store={null} />,
      { wrapper: localeWrapper("ar") }
    );

    expect(
      screen.getByLabelText(PLACE_DOCUMENT_COPY.ar.openLabel("deed.pdf"))
    ).toBeTruthy();
    expect(screen.getByText(PLACE_DOCUMENT_COPY.ar.preview)).toBeTruthy();
    expect(screen.queryByText(PLACE_DOCUMENT_COPY.en.open)).toBeNull();

    const rowStyle = StyleSheet.flatten(
      screen.getByTestId("open-place-document-place-document-1").props.style
    );
    expect(rowStyle.flexDirection).toBe("row-reverse");

    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const rowSource = readFileSync(
      `${process.cwd()}/src/components/PlaceDocumentRow.tsx`,
      "utf8"
    );
    const placeSource = readFileSync(
      `${process.cwd()}/app/place/[id].tsx`,
      "utf8"
    );
    expect(rowSource).toContain("mirrored={rtl}");
    expect(placeSource).toContain("mirrored={rtl}");
    expect(rowSource).not.toContain("scaleX");
    expect(placeSource).not.toContain("scaleX");
  });

  it("keeps a viewer's property value masked in pixels and accessibility", async () => {
    mockCan = () => false;
    const screen = await render(<PlaceScreen />, {
      wrapper: localeWrapper("en")
    });
    const panel = screen.getByTestId("place-recorded-value");

    expect(panel.props.accessibilityLabel).toContain(
      "QAR, recorded amount hidden"
    );
    expect(panel.props.accessibilityLabel).not.toContain("6,750,000");
    expect(
      screen.getByText("QAR \u2022\u2022\u2022\u2022\u2022\u2022")
    ).toBeTruthy();
    expect(screen.queryByText(/QAR\s*6,750,000\.00/u)).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: PLACE_DETAIL_COPY.en.updatePropertyValue
      })
    ).toBeNull();
    expect(screen.getByTestId("place-view-only-notice")).toBeTruthy();
  });

  it("shows non-owned Place truth and removes every property-value entry point", async () => {
    mockActiveWorkspace = {
      ...mockWorkspace,
      places: mockWorkspace.places.map((place) => ({
        ...place,
        kind: "property" as const,
        tenure: "rented" as const
      }))
    };
    const screen = await render(<PlaceScreen />, {
      wrapper: localeWrapper("en")
    });

    expect(
      screen.getByText(
        getCaptureCopy("en").placeClassificationChoices
          .rented_or_managed.label
      )
    ).toBeTruthy();
    expect(
      screen.getByText(PLACE_DETAIL_COPY.en.excludedFromPortfolio)
    ).toBeTruthy();
    expect(screen.queryByTestId("place-recorded-value")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: PLACE_DETAIL_COPY.en.addPropertyValue
      })
    ).toBeNull();

    fireEvent.press(
      screen.getByRole("button", {
        name: PLACE_DETAIL_COPY.en.reviewRelationship
      })
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      `/place-edit?placeId=${encodeURIComponent(
        mockWorkspace.places[0]!.id
      )}`
    );
  });

  it("localizes viewer errors and the system share title", async () => {
    expect(placeDocumentErrorMessage(new Error("boom"), "ar")).toBe(
      PLACE_DOCUMENT_COPY.ar.genericError
    );

    const share = jest.fn(async () => undefined);
    await openPlaceDocument(
      mockDocument,
      {
        store: {
          kind: "memory-preview",
          encryptedAtRest: false,
          ingest: async (file) => file,
          materializeForViewing: async () => ({
            uri: "file:///cache/deed.pdf",
            fileName: "deed.pdf",
            mimeType: "application/pdf",
            byteSize: 1536,
            checksumSha256: null,
            integrity: "unverified-preview",
            temporary: false
          }),
          cleanupMaterialized: async () => undefined
        },
        isSharingAvailable: async () => true,
        share
      },
      PLACE_DOCUMENT_COPY.ar.openDialog(mockDocument.fileName)
    );

    expect(share).toHaveBeenCalledWith(
      "file:///cache/deed.pdf",
      expect.objectContaining({
        dialogTitle: "فتح deed.pdf"
      })
    );
  });
});
