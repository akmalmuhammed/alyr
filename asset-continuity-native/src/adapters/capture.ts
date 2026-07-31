import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import {
  ImageManipulator,
  SaveFormat
} from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import type { CapturedFile } from "@/domain/model";

export type CaptureOutcome =
  | { readonly ok: true; readonly file: CapturedFile }
  | { readonly ok: false; readonly reason: "cancelled" | "permission" | "failed" };

/**
 * Native camera originals use a smaller operational budget than the shared
 * 10 MiB import ceiling. This leaves room for a useful pilot inventory inside
 * the 40 MiB household allowance without modifying selected library/document
 * bytes.
 */
export const MAX_CAMERA_CAPTURE_FILE_BYTES = 2 * 1024 * 1024;

const CAMERA_CAPTURE_PROFILES = [
  { maximumLongEdge: 2_560, compression: 0.82 },
  { maximumLongEdge: 2_048, compression: 0.72 },
  { maximumLongEdge: 1_600, compression: 0.64 },
  { maximumLongEdge: 1_280, compression: 0.56 }
] as const;

function positiveByteSize(
  uri: string,
  reportedSize: number | null | undefined
): number {
  if (
    typeof reportedSize === "number" &&
    Number.isSafeInteger(reportedSize) &&
    reportedSize > 0
  ) {
    return reportedSize;
  }
  const measuredSize = new File(uri).size;
  if (
    Number.isSafeInteger(measuredSize) &&
    measuredSize > 0
  ) {
    return measuredSize;
  }
  throw new Error("The selected file size could not be verified.");
}

function fromImageAsset(asset: ImagePicker.ImagePickerAsset): CapturedFile {
  return {
    localUri: asset.uri,
    fileName:
      asset.fileName ??
      `asset-${new Date().toISOString().replaceAll(":", "-")}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
    byteSize: positiveByteSize(asset.uri, asset.fileSize)
  };
}

function normalizedCameraFileName(
  fileName: string | null | undefined
): string {
  const fallback = `asset-${new Date().toISOString().replaceAll(":", "-")}`;
  const candidate = fileName?.trim() || fallback;
  const extensionIndex = candidate.lastIndexOf(".");
  const stem = extensionIndex > 0
    ? candidate.slice(0, extensionIndex)
    : candidate;
  return `${stem}.jpg`;
}

function removeTemporaryFile(uri: string): void {
  try {
    new File(uri).delete();
  } catch {
    // The OS may already have reclaimed a cache file. A failed best-effort
    // cleanup never changes whether the next bounded capture attempt runs.
  }
}

/**
 * A camera image becomes Heldat's controlled captured original. Re-encoding
 * strips metadata, bounds the long edge and adaptively reduces output size.
 * Library images and imported documents deliberately bypass this function so
 * their selected bytes remain unchanged and are validated by the domain cap.
 */
async function normalizeCameraPhoto(
  asset: ImagePicker.ImagePickerAsset
): Promise<CapturedFile> {
  if (
    !Number.isSafeInteger(asset.width) ||
    asset.width < 1 ||
    !Number.isSafeInteger(asset.height) ||
    asset.height < 1
  ) {
    throw new Error("The captured image dimensions could not be verified.");
  }

  for (const profile of CAMERA_CAPTURE_PROFILES) {
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > profile.maximumLongEdge) {
      context.resize(
        asset.width >= asset.height
          ? { width: profile.maximumLongEdge }
          : { height: profile.maximumLongEdge }
      );
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: profile.compression
    });
    if (
      !Number.isSafeInteger(saved.width) ||
      saved.width < 1 ||
      !Number.isSafeInteger(saved.height) ||
      saved.height < 1 ||
      Math.max(saved.width, saved.height) > profile.maximumLongEdge
    ) {
      removeTemporaryFile(saved.uri);
      throw new Error("The captured image could not be bounded.");
    }
    let byteSize: number;
    try {
      byteSize = positiveByteSize(saved.uri, undefined);
    } catch (error) {
      removeTemporaryFile(saved.uri);
      throw error;
    }
    if (byteSize <= MAX_CAMERA_CAPTURE_FILE_BYTES) {
      return {
        localUri: saved.uri,
        fileName: normalizedCameraFileName(asset.fileName),
        mimeType: "image/jpeg",
        byteSize
      };
    }
    removeTemporaryFile(saved.uri);
  }

  throw new Error("The captured image could not fit the file allowance.");
}

export async function takeAssetPhoto(): Promise<CaptureOutcome> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return { ok: false, reason: "permission" };
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.82,
      exif: false
    });
    if (result.canceled || !result.assets[0]) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: true, file: await normalizeCameraPhoto(result.assets[0]) };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function chooseAssetPhoto(): Promise<CaptureOutcome> {
  try {
    // `launchImageLibraryAsync` uses the operating-system picker. It grants
    // access only to the image the user selects, so requesting broad media
    // library access first would expand Heldat's permission surface without
    // improving the import flow.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: false,
      quality: 1,
      exif: false
    });
    if (result.canceled || !result.assets[0]) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: true, file: fromImageAsset(result.assets[0]) };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function chooseEvidenceDocument(): Promise<CaptureOutcome> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      multiple: false,
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets[0]) {
      return { ok: false, reason: "cancelled" };
    }
    const asset = result.assets[0];
    return {
      ok: true,
      file: {
        localUri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? "application/octet-stream",
        byteSize: positiveByteSize(asset.uri, asset.size)
      }
    };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
