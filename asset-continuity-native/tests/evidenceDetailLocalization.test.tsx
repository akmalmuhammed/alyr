import {
  fireEvent,
  render
} from "@testing-library/react-native";
import type { PropsWithChildren, ReactElement } from "react";
import { Alert, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import EvidenceDetailScreen, {
  EVIDENCE_DETAIL_COPY,
  evidenceBackHref,
  evidenceDateLabel,
  evidenceFileSize,
  evidenceKindLabel,
  evidenceRepairHref,
  evidenceRelationLabel,
  evidenceStorageLabel,
  isolateEvidenceIdentifier
} from "../app/evidence/[id]";
import {
  attachmentReadErrorMessage,
  isolateAttachmentIdentifier,
  PROOF_ATTACHMENT_COPY,
  shareEvidenceAttachment
} from "@/components/AttachmentViewer";
import {
  AttachmentReadError,
  type AttachmentStore,
  type MaterializedAttachment
} from "@/data/attachmentStore";
import type {
  NativeEvidence,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import { LocaleProvider } from "@/i18n/LocaleProvider";

let mockStackOptions: {
  readonly headerLeft?: () => ReactElement | null;
  readonly headerRight?: () => ReactElement | null;
  readonly title?: string;
} = {};
const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  push: jest.fn(),
  replace: jest.fn()
};

const sample = createWorkspace("sample");
const sampleEvidence = sample.evidence[0]!;
const evidence: NativeEvidence = {
  ...sampleEvidence,
  fileName: "ownership-record.pdf",
  mimeType: "application/pdf",
  byteSize: 1536,
  localUri: "file:///preview/ownership-record.pdf",
  checksumSha256: "a".repeat(64),
  reviewStatus: "pending",
  reviewedAt: null,
  expiresAt: "2027-07-27T10:15:00.000Z",
  storageState: "queued",
  capturedAt: "2026-07-27T10:15:00.000Z"
};
let mockWorkspace: NativeWorkspace = {
  ...sample,
  evidence: sample.evidence.map((item) =>
    item.id === evidence.id ? evidence : item
  )
};
let mockParams = { id: evidence.id };
let mockCanReview = true;
const mockSetEvidenceReviewStatus = jest.fn(async () => evidence);

jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({
      options
    }: {
      readonly options: typeof mockStackOptions;
    }) => {
      mockStackOptions = options;
      return null;
    }
  },
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    attachmentStore: null,
    can: () => mockCanReview,
    clearError: jest.fn(),
    error: null,
    repository: {
      encryptedAtRest: false
    },
    saving: false,
    setEvidenceReviewStatus: mockSetEvidenceReviewStatus,
    workspace: mockWorkspace
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
          {children}
        </LocaleProvider>
      </SafeAreaProvider>
    );
  };
}

function leafKeys(value: object): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) =>
      typeof child === "object" && child !== null
        ? leafKeys(child as object).map((nested) => `${key}.${nested}`)
        : [key]
    )
    .sort();
}

describe("Evidence detail localization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanReview = true;
    mockParams = { id: evidence.id };
    mockWorkspace = {
      ...sample,
      evidence: sample.evidence.map((item) =>
        item.id === evidence.id ? evidence : item
      )
    };
  });

  it("keeps the complete English and Arabic copy contracts in parity", () => {
    expect(leafKeys(EVIDENCE_DETAIL_COPY.ar)).toEqual(
      leafKeys(EVIDENCE_DETAIL_COPY.en)
    );
    expect(leafKeys(PROOF_ATTACHMENT_COPY.ar)).toEqual(
      leafKeys(PROOF_ATTACHMENT_COPY.en)
    );
    expect(JSON.stringify(EVIDENCE_DETAIL_COPY.ar)).toMatch(
      /[\u0600-\u06ff]/u
    );
    expect(JSON.stringify(PROOF_ATTACHMENT_COPY.ar)).toMatch(
      /[\u0600-\u06ff]/u
    );
  });

  it("localizes dates, numbers, file sizes, taxonomy and storage truth", () => {
    expect(evidenceFileSize(1536, "ar")).toMatch(/[٢۲]/u);
    expect(
      evidenceDateLabel("2026-07-27T10:15:00.000Z", "ar")
    ).toMatch(/[\u0600-\u06ff]/u);
    expect(evidenceDateLabel("bad-date", "ar")).toBe(
      EVIDENCE_DETAIL_COPY.ar.notRecorded
    );
    expect(evidenceKindLabel("paper", "ar")).toBe("مستند ورقي");
    expect(evidenceRelationLabel("ownership", "ar")).toBe("ملكية");
    expect(evidenceStorageLabel("queued", "ar")).toBe(
      "بانتظار المزامنة"
    );
    expect(evidenceBackHref("asset / one")).toBe("/asset/asset%20%2F%20one");
    expect(evidenceBackHref(null)).toBe("/vault");
    expect(evidenceRepairHref("asset / one")).toBe(
      "/asset-edit?assetId=asset%20%2F%20one&focus=evidence"
    );
    expect(evidenceRepairHref(null)).toBe("/vault");
  });

  it("isolates user and technical identifiers in Arabic", () => {
    const fileName = "GMT Master II #126.pdf";
    expect(isolateEvidenceIdentifier(fileName, "ar")).toBe(
      `\u2068${fileName}\u2069`
    );
    expect(isolateAttachmentIdentifier(fileName, "ar")).toBe(
      `\u2068${fileName}\u2069`
    );
    expect(isolateEvidenceIdentifier(fileName, "en")).toBe(fileName);
  });

  it("renders the Arabic evidence surface, RTL rows and a safe deep-link back target", async () => {
    const screen = await render(<EvidenceDetailScreen />, {
      wrapper: localeWrapper("ar")
    });
    const copy = EVIDENCE_DETAIL_COPY.ar;
    const protectedFileName = isolateEvidenceIdentifier(
      evidence.fileName,
      "ar"
    );

    expect(screen.getByText(copy.metadata)).toBeTruthy();
    expect(screen.getByText(copy.integrityAndStorage)).toBeTruthy();
    expect(screen.getByText(copy.markReviewed)).toBeTruthy();
    expect(screen.queryByText(EVIDENCE_DETAIL_COPY.en.metadata)).toBeNull();
    expect(
      screen.getByLabelText(
        PROOF_ATTACHMENT_COPY.ar.openLabel(protectedFileName)
      )
    ).toBeTruthy();

    const proofRowStyle = StyleSheet.flatten(
      screen.getByTestId(`open-proof-${evidence.id}`).props.style
    );
    expect(proofRowStyle.flexDirection).toBe("row-reverse");

    expect(mockStackOptions.title).toBe(copy.screenTitle);
    const backControl = mockStackOptions.headerRight?.();
    expect(backControl).toBeTruthy();
    (
      backControl as ReactElement<{
        readonly onPress: () => void;
      }>
    ).props.onPress();
    expect(mockRouter.replace).toHaveBeenCalledWith(
      `/asset/${encodeURIComponent(evidence.assetId)}`
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("uses localized review confirmation and preserves viewer permissions", async () => {
    const alert = jest.spyOn(Alert, "alert");
    const screen = await render(<EvidenceDetailScreen />, {
      wrapper: localeWrapper("ar")
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: EVIDENCE_DETAIL_COPY.ar.markReviewed
      })
    );
    expect(alert).toHaveBeenCalledWith(
      EVIDENCE_DETAIL_COPY.ar.reviewAlertTitle,
      EVIDENCE_DETAIL_COPY.ar.reviewAlertBody,
      expect.arrayContaining([
        expect.objectContaining({
          text: EVIDENCE_DETAIL_COPY.ar.notYet,
          style: "cancel"
        }),
        expect.objectContaining({
          text: EVIDENCE_DETAIL_COPY.ar.markReviewed
        })
      ])
    );

    mockCanReview = false;
    const viewer = await render(<EvidenceDetailScreen />, {
      wrapper: localeWrapper("ar")
    });
    expect(viewer.getByTestId("evidence-view-only-notice")).toBeTruthy();
    expect(
      viewer.queryByRole("button", {
        name: EVIDENCE_DETAIL_COPY.ar.markReviewed
      })
    ).toBeNull();
  });

  it("offers an exact replacement-proof action when a personal original is missing", async () => {
    mockWorkspace = {
      ...sample,
      mode: "personal",
      evidence: sample.evidence.map((item) =>
        item.id === evidence.id
          ? { ...evidence, localUri: null, storageState: "synced" }
          : item
      )
    };
    const screen = await render(<EvidenceDetailScreen />, {
      wrapper: localeWrapper("en")
    });

    const action = screen.getByRole("button", {
      name: EVIDENCE_DETAIL_COPY.en.addReplacementProof
    });
    await fireEvent.press(action);

    expect(mockRouter.push).toHaveBeenCalledWith(
      evidenceRepairHref(evidence.assetId)
    );

    mockCanReview = false;
    const viewer = await render(<EvidenceDetailScreen />, {
      wrapper: localeWrapper("en")
    });
    expect(
      viewer.queryByRole("button", {
        name: EVIDENCE_DETAIL_COPY.en.addReplacementProof
      })
    ).toBeNull();
  });

  it("localizes attachment failures and the Arabic system-share title", async () => {
    expect(
      attachmentReadErrorMessage(
        new AttachmentReadError(
          "CHECKSUM_MISMATCH",
          "fixture mismatch"
        ),
        "proof",
        "ar"
      )
    ).toBe("لم يجتز الإثبات فحص سلامة الملف.");

    const materialized: MaterializedAttachment = {
      uri: "file:///cache/ownership-record.pdf",
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      byteSize: evidence.byteSize,
      checksumSha256: evidence.checksumSha256,
      integrity: "aes-gcm-and-sha256",
      temporary: true
    };
    const store: AttachmentStore = {
      kind: "encrypted-files",
      encryptedAtRest: true,
      ingest: async (file) => file,
      materializeForViewing: async () => materialized,
      cleanupMaterialized: async () => undefined
    };
    const share = jest.fn(async () => undefined);
    const title = PROOF_ATTACHMENT_COPY.ar.openDialog(
      isolateAttachmentIdentifier(evidence.fileName, "ar")
    );

    await shareEvidenceAttachment(
      evidence,
      true,
      {
        store,
        isSharingAvailable: async () => true,
        share
      },
      title
    );

    expect(share).toHaveBeenCalledWith(
      materialized.uri,
      expect.objectContaining({
        dialogTitle: title
      })
    );
  });
});
