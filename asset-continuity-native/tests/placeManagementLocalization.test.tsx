import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import {
  Alert,
  StyleSheet
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import PlaceEditRoute from "../app/place-edit";
import PlacePinScreen from "../app/place-pin";
import SpaceEditRoute from "../app/space-edit";
import { placePinEditorLabels } from "@/components/PlacePinEditor/contract";
import { createWorkspace } from "@/domain/sample";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getCaptureCopy } from "@/i18n/captureCopy";
import {
  formatSpaceKind,
  getPlaceManagementCopy,
  isolateCoordinates,
  PLACE_MANAGEMENT_COPY,
  placeManagementErrorMessage,
  spaceUsageSummary
} from "@/i18n/placeManagementCopy";

const sample = createWorkspace("sample");
const samplePlace = sample.places[0]!;
const sampleRoom = samplePlace.rooms[0]!;
let mockParams: {
  placeId?: string;
  roomId?: string;
} = {
  placeId: samplePlace.id
};
const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  push: jest.fn(),
  replace: jest.fn()
};
const mockNavigation = {
  addListener: jest.fn(() => jest.fn())
};
const mockUpdatePlaceBasics = jest.fn(async () => samplePlace);
const mockCreatePlaceSpace = jest.fn(async () => sampleRoom);
const mockUpdatePlaceSpace = jest.fn(async () => sampleRoom);
const mockUpdatePlacePin = jest.fn(async () => samplePlace);
let mockWorkspaceState = {
  can: jest.fn(() => true),
  clearError: jest.fn(),
  createPlaceSpace: mockCreatePlaceSpace,
  error: null as string | null,
  saving: false,
  updatePlaceBasics: mockUpdatePlaceBasics,
  updatePlacePin: mockUpdatePlacePin,
  updatePlaceSpace: mockUpdatePlaceSpace,
  workspace: sample
};
const mockReadCurrentLocation = jest.fn(async () => ({
  ok: false as const,
  reason: "permission" as const
}));

jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({
      options
    }: {
      options: {
        headerLeft?: () => React.ReactNode;
        headerRight?: () => React.ReactNode;
      };
    }) => {
      const React = jest.requireActual("react") as typeof import("react");
      const { View: MockView } = jest.requireActual(
        "react-native"
      ) as typeof import("react-native");
      return React.createElement(
        MockView,
        { testID: "stack-header" },
        options.headerLeft?.(),
        options.headerRight?.()
      );
    }
  },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter
}));

jest.mock("@/adapters/location", () => ({
  readCurrentLocation: () => mockReadCurrentLocation()
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => mockWorkspaceState
}));

jest.mock("expo-network", () => ({
  useNetworkState: () => ({
    isConnected: true,
    isInternetReachable: true
  })
}));

jest.mock("@maplibre/maplibre-react-native", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View: MockView } = jest.requireActual(
    "react-native"
  ) as typeof import("react-native");
  const MockMap = ({
    children,
    ...props
  }: PropsWithChildren<Record<string, unknown>>) =>
    React.createElement(MockView, props, children);
  const MockCamera = (props: Record<string, unknown>) =>
    React.createElement(MockView, props);
  const MockViewAnnotation = ({
    children,
    id,
    ...props
  }: PropsWithChildren<Record<string, unknown> & { id?: string }>) =>
    React.createElement(
      MockView,
      { ...props, testID: `${id ?? "map"}-annotation` },
      children
    );
  return {
    Camera: MockCamera,
    Map: MockMap,
    ViewAnnotation: MockViewAnnotation
  };
});

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

describe("localized Place management routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { placeId: samplePlace.id };
    mockWorkspaceState = {
      can: jest.fn(() => true),
      clearError: jest.fn(),
      createPlaceSpace: mockCreatePlaceSpace,
      error: null,
      saving: false,
      updatePlaceBasics: mockUpdatePlaceBasics,
      updatePlacePin: mockUpdatePlacePin,
      updatePlaceSpace: mockUpdatePlaceSpace,
      workspace: sample
    };
  });

  it("keeps every management copy group in English/Arabic parity", () => {
    expect(Object.keys(PLACE_MANAGEMENT_COPY.ar).sort()).toEqual(
      Object.keys(PLACE_MANAGEMENT_COPY.en).sort()
    );
    expect(
      Object.keys(PLACE_MANAGEMENT_COPY.ar.placeEdit).sort()
    ).toEqual(Object.keys(PLACE_MANAGEMENT_COPY.en.placeEdit).sort());
    expect(
      Object.keys(PLACE_MANAGEMENT_COPY.ar.spaceEdit).sort()
    ).toEqual(Object.keys(PLACE_MANAGEMENT_COPY.en.spaceEdit).sort());
    expect(
      Object.keys(PLACE_MANAGEMENT_COPY.ar.placePin).sort()
    ).toEqual(Object.keys(PLACE_MANAGEMENT_COPY.en.placePin).sort());
    expect(JSON.stringify(PLACE_MANAGEMENT_COPY.ar)).toMatch(
      /[\u0600-\u06ff]/u
    );
  });

  it("formats Arabic count grammar, space kinds, errors and LTR coordinates", () => {
    expect(spaceUsageSummary(0, "ar")).toContain("لا ترتبط أغراض");
    expect(spaceUsageSummary(1, "ar")).toContain("غرض واحد");
    expect(spaceUsageSummary(2, "ar")).toContain("غرضان");
    expect(spaceUsageSummary(7, "ar")).toMatch(/٧/u);
    expect(spaceUsageSummary(27, "ar")).toMatch(/٢٧/u);
    expect(formatSpaceKind("container", "ar")).toBe("حاوية");
    expect(
      placeManagementErrorMessage(
        "Choose a parent space inside this Place.",
        "ar"
      )
    ).toMatch(/[\u0600-\u06ff]/u);
    expect(isolateCoordinates(25.321234, 51.531234)).toBe(
      "\u206625.321234, 51.531234\u2069"
    );
  });

  it("renders Place basics fully in Arabic and returns a direct deep link to its Place", async () => {
    const screen = await render(<PlaceEditRoute />, {
      wrapper: localeWrapper("ar")
    });
    const copy = getPlaceManagementCopy("ar");

    expect(screen.getByText(copy.placeEdit.heading)).toBeTruthy();
    expect(screen.getByLabelText(copy.placeEdit.nameLabel)).toBeTruthy();
    expect(screen.getByText(copy.placeEdit.pinPreserved)).toBeTruthy();
    expect(
      screen.getByText(
        getCaptureCopy("ar").placeClassificationChoices.owned_property
          .label
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(PLACE_MANAGEMENT_COPY.en.placeEdit.heading)
    ).toBeNull();

    const coordinateText = isolateCoordinates(
      samplePlace.latitude!,
      samplePlace.longitude!
    );
    const coordinateStyle = StyleSheet.flatten(
      screen.getByText(coordinateText).props.style
    );
    expect(coordinateStyle.writingDirection).toBe("ltr");
    expect(coordinateStyle.textAlign).toBe("right");
    const placeHeadingStyle = StyleSheet.flatten(
      screen.getByText(copy.placeEdit.kicker).props.style
    );
    expect(placeHeadingStyle.writingDirection).toBe("rtl");

    fireEvent.press(screen.getByTestId("place-edit-back"));
    expect(mockRouter.replace).toHaveBeenCalledWith(
      `/place/${encodeURIComponent(samplePlace.id)}`
    );
  });

  it("saves a changed Place relationship as an explicit classification", async () => {
    const screen = await render(<PlaceEditRoute />, {
      wrapper: localeWrapper("en")
    });
    const copy = getPlaceManagementCopy("en");

    fireEvent.press(
      screen.getByTestId("place-classification-rented_or_managed")
    );
    const saveButton = await waitFor(() => {
      const button = screen.getByRole("button", {
        name: copy.placeEdit.save
      });
      expect(button.props.accessibilityState?.disabled).toBe(false);
      return button;
    });
    fireEvent.press(saveButton);

    await waitFor(() =>
      expect(mockUpdatePlaceBasics).toHaveBeenCalledWith(
        expect.objectContaining({
          placeId: samplePlace.id,
          classification: "rented_or_managed"
        })
      )
    );
  });

  it("renders space hierarchy controls in Arabic with correct grammar and fallback navigation", async () => {
    mockParams = {
      placeId: samplePlace.id,
      roomId: sampleRoom.id
    };
    const screen = await render(<SpaceEditRoute />, {
      wrapper: localeWrapper("ar")
    });
    const copy = getPlaceManagementCopy("ar");
    const itemCount = sample.assets.filter(
      (asset) =>
        asset.placeId === samplePlace.id && asset.roomId === sampleRoom.id
    ).length;

    expect(screen.getByText(copy.spaceEdit.headingEdit)).toBeTruthy();
    expect(screen.getByText(spaceUsageSummary(itemCount, "ar"))).toBeTruthy();
    expect(
      screen.getAllByText(copy.spaceEdit.kinds.room.label).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(copy.spaceEdit.kinds.zone.label)).toBeTruthy();
    expect(screen.getByText(copy.spaceEdit.kinds.container.label)).toBeTruthy();
    expect(
      screen.queryByText(PLACE_MANAGEMENT_COPY.en.spaceEdit.type)
    ).toBeNull();
    const spaceGroupStyle = StyleSheet.flatten(
      screen.getByText(copy.spaceEdit.type).props.style
    );
    expect(spaceGroupStyle.writingDirection).toBe("rtl");

    fireEvent.press(screen.getByTestId("space-edit-back"));
    expect(mockRouter.replace).toHaveBeenCalledWith(
      `/place/${encodeURIComponent(samplePlace.id)}`
    );
  });

  it("renders the property-pin flow in Arabic, mirrors rows, and preserves coordinate direction", async () => {
    const screen = await render(<PlacePinScreen />, {
      wrapper: localeWrapper("ar")
    });
    const copy = getPlaceManagementCopy("ar");
    const pinLabels = placePinEditorLabels("ar");

    expect(screen.getByText(copy.placePin.body)).toBeTruthy();
    expect(screen.getByText(pinLabels.sectionLabel)).toBeTruthy();
    expect(
      screen.queryByText(PLACE_MANAGEMENT_COPY.en.placePin.body)
    ).toBeNull();

    const coordinateRowStyle = StyleSheet.flatten(
      screen.getByTestId("place-pin-editor-coordinate-fields").props.style
    );
    expect(coordinateRowStyle.flexDirection).toBe("row-reverse");
    const latitudeStyle = StyleSheet.flatten(
      screen.getByTestId("place-pin-editor-latitude").props.style
    );
    expect(latitudeStyle.writingDirection).toBe("ltr");
    expect(latitudeStyle.textAlign).toBe("right");
    const pinSectionStyle = StyleSheet.flatten(
      screen.getByText(pinLabels.sectionLabel).props.style
    );
    expect(pinSectionStyle.writingDirection).toBe("rtl");
    const markerStyle = StyleSheet.flatten(
      screen.getByTestId("place-pin-editor-native-marker").props.style
    );
    expect(markerStyle.width).toBeGreaterThanOrEqual(44);
    expect(markerStyle.height).toBeGreaterThanOrEqual(44);

    fireEvent.press(screen.getByTestId("place-pin-back"));
    expect(mockRouter.replace).toHaveBeenCalledWith(
      `/place/${encodeURIComponent(samplePlace.id)}`
    );
  });

  it("uses Arabic recovery copy when iOS location permission is off", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation();
    const screen = await render(<PlacePinScreen />, {
      wrapper: localeWrapper("ar")
    });
    const copy = getPlaceManagementCopy("ar");

    await fireEvent.press(
      screen.getByTestId("place-pin-editor-use-current-location")
    );
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        copy.placePin.permissionTitle,
        copy.placePin.permissionBody,
        expect.arrayContaining([
          expect.objectContaining({ text: copy.placePin.notNow }),
          expect.objectContaining({ text: copy.placePin.openSettings })
        ])
      )
    );
    alert.mockRestore();
  });
});
