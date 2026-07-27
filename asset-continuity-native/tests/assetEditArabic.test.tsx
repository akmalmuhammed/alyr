import {
  fireEvent,
  render
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import {
  Alert,
  StyleSheet
} from "react-native";

import AssetEditRoute from "../app/asset-edit";
import { createWorkspace } from "@/domain/sample";
import {
  ASSET_EDIT_COPY,
  isolateDynamicText
} from "@/i18n/assetEditCopy";
import { CAPTURE_COPY } from "@/i18n/captureCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

const sampleWorkspace = createWorkspace("sample");
const sampleAsset = sampleWorkspace.assets[0]!;
let mockParams: Record<string, string | undefined> = {};
let mockWorkspaceContext: Record<string, unknown>;
let mockBeforeRemove:
  | ((event: {
      preventDefault: () => void;
      data: { action: unknown };
    }) => void)
  | null = null;

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn()
};
const mockNavigation = {
  addListener: jest.fn(
    (
      event: string,
      callback: (event: {
        preventDefault: () => void;
        data: { action: unknown };
      }) => void
    ) => {
      if (event === "beforeRemove") mockBeforeRemove = callback;
      return jest.fn();
    }
  ),
  dispatch: jest.fn()
};

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = require("react") as typeof import("react");
    useEffect(callback, []);
  },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter
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

function arabicWrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider initialLanguage="ar">
      {children}
    </LocaleProvider>
  );
}

describe("Asset Passport editor Arabic contract", () => {
  beforeEach(() => {
    mockParams = {};
    mockBeforeRemove = null;
    mockNavigation.addListener.mockClear();
    mockWorkspaceContext = {
      can: () => true,
      workspace: sampleWorkspace,
      updateAsset: jest.fn(),
      saving: false,
      error: null,
      clearError: jest.fn()
    };
  });

  it("keeps every editor mode, consequence, and recovery state bilingual", () => {
    for (const focus of [
      "photo",
      "evidence",
      "location",
      "identity"
    ] as const) {
      expect(ASSET_EDIT_COPY.ar.heading[focus]).not.toBe(
        ASSET_EDIT_COPY.en.heading[focus]
      );
      expect(ASSET_EDIT_COPY.ar.saveLabel[focus]).not.toBe(
        ASSET_EDIT_COPY.en.saveLabel[focus]
      );
      expect(ASSET_EDIT_COPY.ar.saveHint[focus].blocked).not.toBe(
        ASSET_EDIT_COPY.en.saveHint[focus].blocked
      );
    }
    expect(
      ASSET_EDIT_COPY.ar.transition["physical-to-virtual"].message
    ).toContain("دبوس العقار");
    expect(
      ASSET_EDIT_COPY.ar.photoPreview.protectedPhotoError
    ).toContain("الصورة");
    expect(isolateDynamicText("GMT-Master II")).toBe(
      "\u2068GMT-Master II\u2069"
    );
  });

  it("renders the missing-record state in Arabic", async () => {
    mockWorkspaceContext = {
      ...mockWorkspaceContext,
      workspace: { ...sampleWorkspace, assets: [] }
    };
    const screen = await render(<AssetEditRoute />, {
      wrapper: arabicWrapper
    });

    expect(
      screen.getByText(ASSET_EDIT_COPY.ar.passportNotFound)
    ).toBeTruthy();
    expect(
      screen.getByText(ASSET_EDIT_COPY.ar.passportNotFoundBody)
    ).toBeTruthy();
  });

  it("mirrors identity choices and localizes the unsaved-change decision", async () => {
    mockParams = {
      assetId: sampleAsset.id,
      focus: "identity",
      returnTo: "passport"
    };
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const screen = await render(<AssetEditRoute />, {
      wrapper: arabicWrapper
    });

    expect(
      screen.getByText(ASSET_EDIT_COPY.ar.updatePassport)
    ).toBeTruthy();
    expect(
      screen.getByText(ASSET_EDIT_COPY.ar.heading.identity)
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: ASSET_EDIT_COPY.ar.saveLabel.identity
      })
    ).toBeDisabled();

    const watchChoice = screen.getByRole("radio", {
      name: CAPTURE_COPY.ar.categoryLabels["lifestyle.watch"]!
    });
    expect(StyleSheet.flatten(watchChoice.props.style).flexDirection).toBe(
      "row-reverse"
    );

    const nameField = screen.getByLabelText(
      ASSET_EDIT_COPY.ar.itemName
    );
    await fireEvent.changeText(nameField, "");
    expect(screen.getByText(CAPTURE_COPY.ar.nameError)).toBeTruthy();
    await fireEvent.changeText(nameField, `${sampleAsset.name} 2`);
    expect(mockBeforeRemove).not.toBeNull();
    mockBeforeRemove?.({
      preventDefault: jest.fn(),
      data: { action: { type: "GO_BACK" } }
    });

    expect(alertSpy).toHaveBeenCalledWith(
      ASSET_EDIT_COPY.ar.discardTitle,
      ASSET_EDIT_COPY.ar.discardBody,
      expect.arrayContaining([
        expect.objectContaining({
          text: ASSET_EDIT_COPY.ar.keepEditing
        }),
        expect.objectContaining({
          text: ASSET_EDIT_COPY.ar.discardChanges,
          style: "destructive"
        })
      ])
    );
    alertSpy.mockRestore();
  });

  it("routes all user-facing editor copy through locale contracts", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/asset-edit.tsx`,
      "utf8"
    );

    expect(source).toContain("getAssetEditCopy(language)");
    expect(source).toContain("getCaptureCopy(language)");
    expect(source).toContain("localizedCategoryLabel(");
    expect(source).toContain("captureCopy.nameError");
    expect(source).toContain("captureCopy.exactLocationError");
    expect(source).toContain("captureCopy.placeError");
    expect(source).not.toContain('"Discard these changes?"');
    expect(source).not.toContain('"Save photo"');
    expect(source).not.toContain('"No file selected"');
    expect(source).not.toContain("\"I still don't know\"");
  });
});
