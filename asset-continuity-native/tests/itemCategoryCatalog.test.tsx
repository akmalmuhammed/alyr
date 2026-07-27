import { FOCUSED_V1_CATEGORIES } from "@alyr/domain";
import {
  fireEvent,
  render
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";

import CaptureScreen from "../app/capture";
import {
  filterItemCategories,
  groupItemCategories
} from "@/domain/assetCategoryCatalog";
import {
  CATEGORY_CHOICES,
  findCategoryChoice
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import {
  CAPTURE_COPY,
  localizedCategoryLabel
} from "@/i18n/captureCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

jest.setTimeout(15_000);

const mockRouter = {
  back: jest.fn(),
  replace: jest.fn()
};
const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn()
};
const mockWorkspace = createWorkspace("personal");

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: () => true,
    workspace: mockWorkspace,
    saving: false,
    error: null,
    clearError: jest.fn(),
    createPlace: jest.fn(),
    createAsset: jest.fn()
  })
}));

jest.mock("@/accessibility/useReduceMotionPreference", () => ({
  useReduceMotionPreference: () => false
}));

jest.mock("@/components/PlacePinEditor", () => ({
  PlacePinEditor: () => null
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
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

describe("Quick Passport item taxonomy", () => {
  it("exposes every approved item category while keeping real estate in Places", () => {
    const approvedItemIds = FOCUSED_V1_CATEGORIES.filter(
      (category) => category.kind !== "real-estate"
    ).map((category) => category.id);

    expect(CATEGORY_CHOICES.map((category) => category.id)).toEqual(
      approvedItemIds
    );
    expect(CATEGORY_CHOICES).toHaveLength(11);
    expect(
      CATEGORY_CHOICES.some((category) =>
        category.id.startsWith("property.")
      )
    ).toBe(false);
    expect(
      CATEGORY_CHOICES.map((category) => category.groupId)
    ).not.toContain("real-estate-land");
    expect(
      groupItemCategories(CATEGORY_CHOICES).flatMap((group) =>
        group.categories.map((category) => category.id)
      )
    ).toHaveLength(11);
    expect(findCategoryChoice("property.house")).toMatchObject({
      id: "property.house",
      label: "Real estate",
      supportsPhysicalLocation: true
    });
  });

  it("searches localized category and group labels in English and Arabic", () => {
    const englishMatches = filterItemCategories(
      "documents",
      (category) =>
        localizedCategoryLabel(category.id, category.label, "en"),
      (groupId) => CAPTURE_COPY.en.categoryGroupLabels[groupId] ?? groupId
    );
    const arabicMatches = filterItemCategories(
      "مجوهرات",
      (category) =>
        localizedCategoryLabel(category.id, category.label, "ar"),
      (groupId) => CAPTURE_COPY.ar.categoryGroupLabels[groupId] ?? groupId
    );

    expect(englishMatches.map((category) => category.id)).toEqual([
      "digital.asset",
      "document.important"
    ]);
    expect(arabicMatches.map((category) => category.id)).toEqual([
      "lifestyle.jewelry"
    ]);
  });

  it("keeps the first screen compact, then reveals and filters all categories", async () => {
    const screen = await render(<CaptureScreen />);

    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(
      screen.getByText(CAPTURE_COPY.en.propertyIsPlace)
    ).toBeTruthy();
    expect(screen.queryByText("Real estate")).toBeNull();

    await fireEvent.press(
      screen.getByRole("button", {
        name: CAPTURE_COPY.en.browseAllCategories
      })
    );

    expect(screen.getAllByRole("radio")).toHaveLength(11);
    expect(screen.getByText("Vehicles")).toBeTruthy();
    expect(screen.getByText("Digital & documents")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByLabelText(CAPTURE_COPY.en.searchCategories),
      "motorbike"
    );

    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(
      screen.getByRole("radio", { name: "Motorbike" })
    ).toBeTruthy();
  });

  it("mirrors the progressive catalog and category search in Arabic", async () => {
    const screen = await render(<CaptureScreen />, {
      wrapper: arabicWrapper
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: CAPTURE_COPY.ar.browseAllCategories
      })
    );
    const search = screen.getByLabelText(
      CAPTURE_COPY.ar.searchCategories
    );
    const searchStyle = StyleSheet.flatten(search.props.style);

    expect(screen.getByText("المركبات")).toBeTruthy();
    expect(screen.getByText("مستند مهم")).toBeTruthy();
    expect(searchStyle.writingDirection).toBe("rtl");
    expect(searchStyle.textAlign).toBe("right");
  });
});
