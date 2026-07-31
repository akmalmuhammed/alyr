const mockFileSize = jest.fn<number, [string]>();
const mockFileDelete = jest.fn<void, [string]>();
const mockResize = jest.fn();
const mockSave = jest.fn();
const mockRender = jest.fn();

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    readonly size: number;
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
      this.size = mockFileSize(uri);
    }

    delete(): void {
      mockFileDelete(this.uri);
    }
  }
}));

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: {
    manipulate: jest.fn()
  },
  SaveFormat: {
    JPEG: "jpeg"
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
import { ImageManipulator } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { MAX_ASSET_CAPTURE_FILE_BYTES } from "@alyr/domain";

import {
  chooseAssetPhoto,
  chooseEvidenceDocument,
  MAX_CAMERA_CAPTURE_FILE_BYTES,
  takeAssetPhoto
} from "@/adapters/capture";

const requestCamera = jest.mocked(
  ImagePicker.requestCameraPermissionsAsync
);
const manipulateImage = jest.mocked(ImageManipulator.manipulate);
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
    mockResize.mockReturnValue(undefined);
    mockSave.mockResolvedValue({
      uri: "file:///normalized-camera.jpg",
      width: 2_560,
      height: 1_920
    });
    mockRender.mockResolvedValue({ saveAsync: mockSave });
    manipulateImage.mockReturnValue({
      resize: mockResize,
      renderAsync: mockRender
    } as unknown as ReturnType<typeof ImageManipulator.manipulate>);
  });

  it("stores a camera photo as a bounded metadata-free JPEG", async () => {
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///camera.jpg",
          fileName: "camera.jpg",
          mimeType: "image/jpeg",
          width: 4_000,
          height: 3_000
        }
      ]
    });

    const outcome = await takeAssetPhoto();
    expect(manipulateImage).toHaveBeenCalledWith("file:///camera.jpg");
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      ok: true,
      file: {
        localUri: "file:///normalized-camera.jpg",
        fileName: "camera.jpg",
        mimeType: "image/jpeg",
        byteSize: 2_048
      }
    });
    expect(launchCamera).toHaveBeenCalledWith({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.82,
      exif: false
    });
    expect(mockResize).toHaveBeenCalledWith({ width: 2_560 });
    expect(mockSave).toHaveBeenCalledWith({
      format: "jpeg",
      compress: 0.82
    });
    expect(mockFileSize).toHaveBeenCalledWith(
      "file:///normalized-camera.jpg"
    );
    expect(requestCamera).toHaveBeenCalledTimes(1);
  });

  it("retries a camera result above 2 MiB with a smaller profile", async () => {
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///noisy-camera.heic",
          fileName: "noisy-camera.heic",
          mimeType: "image/heic",
          width: 4_032,
          height: 3_024
        }
      ]
    });
    mockSave
      .mockResolvedValueOnce({
        uri: "file:///normalized-large.jpg",
        width: 2_560,
        height: 1_920
      })
      .mockResolvedValueOnce({
        uri: "file:///normalized-small.jpg",
        width: 2_048,
        height: 1_536
      });
    mockFileSize.mockImplementation((uri) =>
      uri.endsWith("normalized-large.jpg")
        ? MAX_CAMERA_CAPTURE_FILE_BYTES + 1
        : 1_800_000
    );

    await expect(takeAssetPhoto()).resolves.toMatchObject({
      ok: true,
      file: {
        localUri: "file:///normalized-small.jpg",
        fileName: "noisy-camera.jpg",
        mimeType: "image/jpeg",
        byteSize: 1_800_000
      }
    });
    expect(manipulateImage).toHaveBeenCalledTimes(2);
    expect(mockResize).toHaveBeenNthCalledWith(1, { width: 2_560 });
    expect(mockResize).toHaveBeenNthCalledWith(2, { width: 2_048 });
    expect(mockSave).toHaveBeenNthCalledWith(2, {
      format: "jpeg",
      compress: 0.72
    });
    expect(mockFileDelete).toHaveBeenCalledWith(
      "file:///normalized-large.jpg"
    );
    expect(MAX_CAMERA_CAPTURE_FILE_BYTES).toBeLessThan(
      MAX_ASSET_CAPTURE_FILE_BYTES
    );
  });

  it("fails after every camera profile remains above 2 MiB", async () => {
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///pathological-noise.jpg",
          fileName: "pathological-noise.jpg",
          mimeType: "image/jpeg",
          width: 4_000,
          height: 3_000
        }
      ]
    });
    const outputs = [
      ["file:///attempt-2560.jpg", 2_560, 1_920],
      ["file:///attempt-2048.jpg", 2_048, 1_536],
      ["file:///attempt-1600.jpg", 1_600, 1_200],
      ["file:///attempt-1280.jpg", 1_280, 960]
    ] as const;
    for (const [uri, width, height] of outputs) {
      mockSave.mockResolvedValueOnce({ uri, width, height });
    }
    mockFileSize.mockReturnValue(MAX_CAMERA_CAPTURE_FILE_BYTES + 1);

    await expect(takeAssetPhoto()).resolves.toEqual({
      ok: false,
      reason: "failed"
    });
    expect(manipulateImage).toHaveBeenCalledTimes(4);
    expect(mockResize).toHaveBeenNthCalledWith(4, { width: 1_280 });
    expect(mockSave).toHaveBeenNthCalledWith(4, {
      format: "jpeg",
      compress: 0.56
    });
    expect(mockFileDelete.mock.calls.map(([uri]) => uri)).toEqual(
      outputs.map(([uri]) => uri)
    );
  });

  it("fails closed when native normalization exceeds its declared bounds", async () => {
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///camera.jpg",
          fileName: "camera.jpg",
          mimeType: "image/jpeg",
          width: 4_000,
          height: 3_000
        }
      ]
    });
    mockSave.mockResolvedValue({
      uri: "file:///unbounded.jpg",
      width: 4_000,
      height: 3_000
    });

    await expect(takeAssetPhoto()).resolves.toEqual({
      ok: false,
      reason: "failed"
    });
    expect(mockFileDelete).toHaveBeenCalledWith(
      "file:///unbounded.jpg"
    );
  });

  it("removes a normalized camera file whose size cannot be verified", async () => {
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///camera.jpg",
          fileName: "camera.jpg",
          mimeType: "image/jpeg",
          width: 2_000,
          height: 1_500
        }
      ]
    });
    mockFileSize.mockReturnValue(0);

    await expect(takeAssetPhoto()).resolves.toEqual({
      ok: false,
      reason: "failed"
    });
    expect(mockFileDelete).toHaveBeenCalledWith(
      "file:///normalized-camera.jpg"
    );
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
    expect(manipulateImage).not.toHaveBeenCalled();
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
    expect(manipulateImage).not.toHaveBeenCalled();
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
