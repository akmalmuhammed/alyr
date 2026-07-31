import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import type { CapturedFile } from "@/domain/model";

export type CaptureOutcome =
  | { readonly ok: true; readonly file: CapturedFile }
  | { readonly ok: false; readonly reason: "cancelled" | "permission" | "failed" };

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
    return { ok: true, file: fromImageAsset(result.assets[0]) };
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
