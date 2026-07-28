import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import * as Sharing from "expo-sharing";
import type { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";

import { VaultRecentProof } from "@/components/VaultRecentProof";
import type { ScopedAttachmentStore } from "@/data/attachmentStore";
import type {
  NativeEvidence,
  NativePlaceDocument,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import {
  getRecentProofEntries,
  recentProofCountLabel
} from "@/vault/recentProof";

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined)
}));

const baseWorkspace = createWorkspace("sample");
const place = baseWorkspace.places[0]!;
const placeDocument: NativePlaceDocument = {
  id: "place-document-newest",
  versionId: "place-document-newest-v1",
  blobObjectId: "place-document-newest-blob",
  householdId: baseWorkspace.household.id,
  placeId: place.id,
  fileName: "West Bay title deed.pdf",
  mimeType: "application/pdf",
  byteSize: 384_000,
  localUri: "file:///west-bay-title-deed.pdf",
  checksumSha256: "a".repeat(64),
  encryptedAtRest: true,
  storageState: "on-device",
  capturedAt: "2026-07-27T09:00:00.000Z"
};

const workspace: NativeWorkspace = {
  ...baseWorkspace,
  placeDocuments: [placeDocument]
};

function localeWrapper(language: "en" | "ar") {
  return function TestLocaleWrapper({ children }: PropsWithChildren) {
    return (
      <LocaleProvider initialLanguage={language}>
        {children}
      </LocaleProvider>
    );
  };
}

describe("Vault recent proof", () => {
  it("merges asset evidence and Place documents newest-first", () => {
    const orphanEvidence: NativeEvidence = {
      ...baseWorkspace.evidence[0]!,
      id: "orphan-evidence",
      assetId: "missing-asset",
      capturedAt: "2026-07-28T09:00:00.000Z"
    };
    const orphanDocument: NativePlaceDocument = {
      ...placeDocument,
      id: "orphan-place-document",
      placeId: "missing-place",
      capturedAt: "2026-07-29T09:00:00.000Z"
    };
    const entries = getRecentProofEntries({
      ...workspace,
      evidence: [...workspace.evidence, orphanEvidence],
      placeDocuments: [placeDocument, orphanDocument]
    });

    expect(entries[0]).toMatchObject({
      kind: "place-document",
      id: placeDocument.id
    });
    expect(entries.some((entry) => entry.id === orphanEvidence.id)).toBe(
      false
    );
    expect(entries.some((entry) => entry.id === orphanDocument.id)).toBe(
      false
    );
    expect(entries).toHaveLength(
      baseWorkspace.evidence.length + 1
    );
  });

  it("opens asset proof through its existing evidence route callback", async () => {
    const onOpenEvidence = jest.fn();
    const screen = await render(
      <VaultRecentProof
        attachmentStore={null}
        onOpenEvidence={onOpenEvidence}
        workspace={workspace}
      />,
      { wrapper: localeWrapper("en") }
    );

    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.vault.recentProof)
    ).toBeTruthy();
    expect(screen.getByText(placeDocument.fileName)).toBeTruthy();
    await fireEvent.press(
      screen.getByTestId("vault-recent-evidence-evidence-1")
    );
    expect(onOpenEvidence).toHaveBeenCalledWith("evidence-1");
  });

  it("opens Place proof through the verified temporary-file boundary and cleans it", async () => {
    const materialized = {
      uri: "file:///verified-cache/west-bay-title-deed.pdf",
      fileName: placeDocument.fileName,
      mimeType: placeDocument.mimeType,
      byteSize: placeDocument.byteSize,
      checksumSha256: placeDocument.checksumSha256,
      integrity: "aes-gcm-and-sha256" as const,
      temporary: true
    };
    const materializeForViewing = jest.fn(async () => materialized);
    const cleanupMaterialized = jest.fn(async () => undefined);
    const attachmentStore = {
      kind: "encrypted-files",
      encryptedAtRest: true,
      materializeForViewing,
      cleanupMaterialized
    } as unknown as ScopedAttachmentStore;
    const screen = await render(
      <VaultRecentProof
        attachmentStore={attachmentStore}
        onOpenEvidence={jest.fn()}
        workspace={workspace}
      />,
      { wrapper: localeWrapper("en") }
    );

    await fireEvent.press(
      screen.getByTestId(
        `open-place-document-${placeDocument.id}`
      )
    );

    await waitFor(() => {
      expect(materializeForViewing).toHaveBeenCalledTimes(1);
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        materialized.uri,
        expect.objectContaining({
          mimeType: placeDocument.mimeType
        })
      );
      expect(cleanupMaterialized).toHaveBeenCalledWith(materialized);
    });
  });

  it("keeps the first view compact and reveals the complete proof list", async () => {
    const screen = await render(
      <VaultRecentProof
        attachmentStore={null}
        onOpenEvidence={jest.fn()}
        workspace={workspace}
      />,
      { wrapper: localeWrapper("en") }
    );

    expect(
      screen.queryByTestId("vault-recent-evidence-photo-study-art")
    ).toBeNull();
    await fireEvent.press(
      screen.getByTestId("vault-recent-proof-disclosure")
    );
    expect(
      screen.getByTestId("vault-recent-evidence-photo-study-art")
    ).toBeTruthy();
  });

  it("uses fixed reference and state columns instead of decorative evidence boxes", async () => {
    const screen = await render(
      <VaultRecentProof
        attachmentStore={null}
        onOpenEvidence={jest.fn()}
        workspace={workspace}
      />,
      { wrapper: localeWrapper("en") }
    );
    const referenceStyle = StyleSheet.flatten(
      screen.getByTestId("vault-proof-reference-evidence-1", {
        includeHiddenElements: true
      }).props.style
    );
    const stateStyle = StyleSheet.flatten(
      screen.getByTestId("vault-proof-state-evidence-1").props.style
    );
    const rowStyle = StyleSheet.flatten(
      screen.getByTestId("vault-recent-evidence-evidence-1").props.style
    );
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/src/components/VaultRecentProof.tsx`,
      "utf8"
    );

    expect(screen.getByTestId("vault-proof-column-header")).toBeTruthy();
    expect(screen.getByText(CORE_JOURNEY_COPY.en.vault.recentProofRecord)).toBeTruthy();
    expect(referenceStyle.width).toBe(30);
    expect(referenceStyle.writingDirection).toBe("ltr");
    expect(stateStyle.width).toBe(88);
    expect(rowStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(source).not.toContain("proofIcon");
    expect(source).not.toContain("emptyIcon");
    expect(source).not.toContain("numberOfLines");
  });

  it("renders native Arabic copy, RTL text and localized counts", async () => {
    const screen = await render(
      <VaultRecentProof
        attachmentStore={null}
        onOpenEvidence={jest.fn()}
        workspace={workspace}
      />,
      { wrapper: localeWrapper("ar") }
    );
    const title = screen.getByText(
      CORE_JOURNEY_COPY.ar.vault.recentProof
    );
    const titleStyle = StyleSheet.flatten(title.props.style);

    expect(
      screen.queryByText(CORE_JOURNEY_COPY.en.vault.recentProof)
    ).toBeNull();
    expect(titleStyle.fontFamily).toBe(
      "IBMPlexSansArabic_600SemiBold"
    );
    expect(titleStyle.writingDirection).toBe("rtl");
    expect(recentProofCountLabel(1, "ar")).toBe("ملف واحد");
    expect(recentProofCountLabel(2, "ar")).toBe("ملفان");
    expect(recentProofCountLabel(5, "ar")).toContain("٥");
    expect(
      screen.getByText(CORE_JOURNEY_COPY.ar.vault.recentProofReference)
    ).toBeTruthy();
    expect(
      StyleSheet.flatten(
        screen.getByTestId("vault-proof-column-header").props.style
      ).flexDirection
    ).toBe("row-reverse");
  });
});
