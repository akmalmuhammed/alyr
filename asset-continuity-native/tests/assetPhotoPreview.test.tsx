import {
  render,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { AppState, StyleSheet } from "react-native";

import { AssetPhotoPreview } from "@/components/AssetPhotoPreview";
import type {
  NativeAsset,
  NativeEvidence
} from "@/domain/model";
import { ASSET_EDIT_COPY } from "@/i18n/assetEditCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

let mockWorkspaceContext: Record<string, unknown>;

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => mockWorkspaceContext
}));

function arabicWrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider initialLanguage="ar">
      {children}
    </LocaleProvider>
  );
}

const asset: NativeAsset = {
  id: "asset-photo-test",
  version: 2,
  householdId: "household-test",
  name: "Heirloom watch",
  categoryId: "lifestyle.watch",
  categoryLabel: "Watch",
  visualKind: "watch",
  photoUri: null,
  photoProtectedUri: "file:///vault/photo.alyrblob",
  photoChecksumSha256: "a".repeat(64),
  photoEvidenceId: "evidence-photo-test",
  locationStatus: "unknown",
  placeId: null,
  roomId: null,
  locatorText: null,
  evidenceIds: [],
  lifecycleStatus: "active",
  archivedAt: null,
  syncStatus: "on-device",
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z"
};

const photoEvidence: NativeEvidence = {
  id: "evidence-photo-test",
  version: 1,
  versionId: "version-photo-test",
  blobObjectId: "blob-photo-test",
  householdId: "household-test",
  assetId: asset.id,
  kind: "media",
  relation: "condition",
  fileName: "heirloom-watch.jpg",
  mimeType: "image/jpeg",
  byteSize: 2048,
  localUri: "file:///vault/photo.alyrblob",
  checksumSha256: "a".repeat(64),
  reviewStatus: "reviewed",
  reviewedAt: "2026-07-27T00:00:00.000Z",
  storageState: "on-device",
  capturedAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z"
};

function protectedStore() {
  const materialized = {
    uri: "file:///cache/alyr-materialized/verified-watch.jpg",
    fileName: photoEvidence.fileName,
    mimeType: photoEvidence.mimeType,
    byteSize: photoEvidence.byteSize,
    checksumSha256: photoEvidence.checksumSha256,
    integrity: "aes-gcm-and-sha256" as const,
    temporary: true
  };
  return {
    materialized,
    store: {
      kind: "encrypted-files" as const,
      encryptedAtRest: true,
      ingest: jest.fn(async (file) => file),
      materializeForViewing: jest.fn(async () => materialized),
      cleanupMaterialized: jest.fn(async () => undefined)
    }
  };
}

describe("protected asset photo previews", () => {
  beforeEach(() => {
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "active"
    });
  });

  it("uses only a verified ephemeral URI for bounded list and editor images, then cleans it", async () => {
    const { materialized, store } = protectedStore();
    mockWorkspaceContext = {
      workspace: { mode: "personal", language: "en" },
      repository: { encryptedAtRest: true },
      attachmentStore: store
    };

    const screen = await render(
      <AssetPhotoPreview
        active
        asset={asset}
        evidence={[photoEvidence]}
        variant="thumbnail"
      />
    );

    const thumbnail = await screen.findByTestId(
      `asset-photo-thumbnail-${asset.id}`
    );
    expect(thumbnail.props.source).toEqual({ uri: materialized.uri });
    expect(thumbnail.props.source.uri).not.toBe(asset.photoProtectedUri);
    expect(thumbnail).toHaveStyle({ width: 56, height: 56 });
    expect(store.materializeForViewing).toHaveBeenCalledWith({
      storage: "encrypted",
      protectedUri: asset.photoProtectedUri,
      fileName: photoEvidence.fileName,
      mimeType: photoEvidence.mimeType,
      byteSize: photoEvidence.byteSize,
      checksumSha256: photoEvidence.checksumSha256
    });

    await screen.rerender(
      <AssetPhotoPreview
        active
        asset={asset}
        evidence={[photoEvidence]}
        variant="command"
      />
    );
    const command = screen.getByTestId(`asset-photo-command-${asset.id}`);
    expect(command.props.source).toEqual({ uri: materialized.uri });
    expect(command).toHaveStyle({ width: 68, height: 68 });

    await screen.rerender(
      <AssetPhotoPreview
        active
        asset={asset}
        evidence={[photoEvidence]}
        variant="editor"
      />
    );
    const editor = screen.getByTestId(`asset-photo-editor-${asset.id}`);
    expect(editor.props.source).toEqual({ uri: materialized.uri });
    expect(editor).toHaveStyle({ width: "100%", height: 224 });

    await screen.rerender(
      <AssetPhotoPreview
        active={false}
        asset={asset}
        evidence={[photoEvidence]}
        variant="editor"
      />
    );
    await waitFor(() => {
      expect(store.cleanupMaterialized).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps metadata-only sample photos on local category artwork", async () => {
    const { store } = protectedStore();
    mockWorkspaceContext = {
      workspace: { mode: "sample", language: "en" },
      repository: { encryptedAtRest: true },
      attachmentStore: store
    };
    const sampleAsset = {
      ...asset,
      photoProtectedUri: null,
      photoChecksumSha256: null
    };
    const sampleEvidence = {
      ...photoEvidence,
      localUri: null,
      checksumSha256: null
    };
    const screen = await render(
      <AssetPhotoPreview
        active
        asset={sampleAsset}
        evidence={[sampleEvidence]}
        variant="editor"
      />
    );

    expect(screen.getByText("Sample category artwork")).toBeTruthy();
    expect(
      screen.getByTestId(`asset-photo-fallback-editor-${asset.id}`)
    ).toBeTruthy();
    expect(store.materializeForViewing).not.toHaveBeenCalled();
  });

  it("localizes editor fallback and accessible photo state in Arabic", async () => {
    const { store } = protectedStore();
    mockWorkspaceContext = {
      workspace: { mode: "personal", language: "ar" },
      repository: { encryptedAtRest: true },
      attachmentStore: store
    };
    const noPhotoAsset: NativeAsset = {
      ...asset,
      photoUri: null,
      photoProtectedUri: null,
      photoChecksumSha256: null,
      photoEvidenceId: null
    };
    const screen = await render(
      <AssetPhotoPreview
        active
        asset={noPhotoAsset}
        evidence={[]}
        variant="editor"
      />,
      { wrapper: arabicWrapper }
    );

    const fallback = screen.getByTestId(
      `asset-photo-fallback-editor-${asset.id}`
    );
    const label = screen.getByText(
      ASSET_EDIT_COPY.ar.photoPreview.noPrimaryPhoto
    );
    const labelStyle = StyleSheet.flatten(label.props.style);

    expect(fallback.props.accessibilityLabel).toBe(
      ASSET_EDIT_COPY.ar.photoPreview.noPrimaryPhoto
    );
    expect(fallback.props.accessibilityRole).toBe("image");
    expect(
      screen.getByText(
        ASSET_EDIT_COPY.ar.photoPreview.selectedPhotoProtection
      )
    ).toBeTruthy();
    expect(labelStyle.writingDirection).toBe("rtl");
    expect(labelStyle.textAlign).toBe("right");
  });

  it("wires both audited surfaces to the protected preview component", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const listSource = readFileSync(
      `${process.cwd()}/src/components/AssetListItem.tsx`,
      "utf8"
    );
    const editSource = readFileSync(
      `${process.cwd()}/app/asset-edit.tsx`,
      "utf8"
    );

    expect(listSource).toContain("<AssetPhotoPreview");
    expect(editSource).toContain("<AssetPhotoPreview");
    expect(listSource).not.toContain("source={{ uri: asset.photoUri }}");
    expect(editSource).not.toContain("source={{ uri: asset.photoUri }}");
  });
});
