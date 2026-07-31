const mockFileSize = jest.fn<number, [string]>();

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    readonly size: number;

    constructor(uri: string) {
      this.size = mockFileSize(uri);
    }
  }
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn()
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn()
}));

import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import {
  chooseAssetPhoto,
  chooseEvidenceDocument,
  takeAssetPhoto
} from "@/adapters/capture";

const requestCamera = jest.mocked(
  ImagePicker.requestCameraPermissionsAsync
);
const requestLibrary = jest.mocked(
  ImagePicker.requestMediaLibraryPermissionsAsync
);
const launchCamera = jest.mocked(ImagePicker.launchCameraAsync);
const launchLibrary = jest.mocked(
  ImagePicker.launchImageLibraryAsync
);
const pickDocument = jest.mocked(DocumentPicker.getDocumentAsync);

describe("native capture adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestCamera.mockResolvedValue({
      granted: true
    } as Awaited<ReturnType<typeof requestCamera>>);
    mockFileSize.mockReturnValue(2_048);
  });

  it("measures a camera file when the picker omits fileSize", async () => {
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///camera.jpg",
          fileName: "camera.jpg",
          mimeType: "image/jpeg",
          width: 1_200,
          height: 900
        }
      ]
    });

    await expect(takeAssetPhoto()).resolves.toMatchObject({
      ok: true,
      file: {
        localUri: "file:///camera.jpg",
        byteSize: 2_048
      }
    });
    expect(mockFileSize).toHaveBeenCalledWith("file:///camera.jpg");
    expect(requestCamera).toHaveBeenCalledTimes(1);
  });

  it("keeps camera capture behind an explicit camera permission", async () => {
    requestCamera.mockResolvedValue({
      granted: false
    } as Awaited<ReturnType<typeof requestCamera>>);

    await expect(takeAssetPhoto()).resolves.toEqual({
      ok: false,
      reason: "permission"
    });
    expect(launchCamera).not.toHaveBeenCalled();
  });

  it("uses a valid picker size without a filesystem lookup", async () => {
    launchLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///library.jpg",
          fileName: "library.jpg",
          mimeType: "image/jpeg",
          fileSize: 4_096,
          width: 1_200,
          height: 900
        }
      ]
    });

    await expect(chooseAssetPhoto()).resolves.toMatchObject({
      ok: true,
      file: { byteSize: 4_096 }
    });
    expect(requestLibrary).not.toHaveBeenCalled();
    expect(launchLibrary).toHaveBeenCalledWith({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: false,
      quality: 1,
      exif: false
    });
    expect(mockFileSize).not.toHaveBeenCalled();
  });

  it("measures a copied document when the picker omits size", async () => {
    pickDocument.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///proof.pdf",
          name: "proof.pdf",
          mimeType: "application/pdf",
          lastModified: 0
        }
      ]
    });
    mockFileSize.mockReturnValue(8_192);

    await expect(chooseEvidenceDocument()).resolves.toMatchObject({
      ok: true,
      file: {
        localUri: "file:///proof.pdf",
        byteSize: 8_192
      }
    });
  });

  it("rejects a selection whose positive byte size cannot be verified", async () => {
    launchLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///missing.jpg",
          fileName: "missing.jpg",
          mimeType: "image/jpeg",
          width: 1_200,
          height: 900
        }
      ]
    });
    mockFileSize.mockReturnValue(0);

    await expect(chooseAssetPhoto()).resolves.toEqual({
      ok: false,
      reason: "failed"
    });
  });
});
