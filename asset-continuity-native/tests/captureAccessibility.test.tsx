import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";

import { AssetMutationValidationError } from "@alyr/domain";

import CaptureScreen from "../app/capture";
import { getCaptureCopy } from "@/i18n/captureCopy";
import { createWorkspace } from "@/domain/sample";

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn()
};
const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn()
};
const personalWorkspace = createWorkspace("personal");
const sampleWorkspace = createWorkspace("sample");
const samplePlace = sampleWorkspace.places[0]!;
const mockWorkspace = {
  ...personalWorkspace,
  places: [
    {
      ...samplePlace,
      householdId: personalWorkspace.household.id,
      confirmedAt: null
    }
  ]
};
const mockCreateAsset = jest.fn();
const mockPlayTactileFeedback = jest.fn<
  Promise<void>,
  [string, { readonly reduceMotion: boolean }]
>(async () => undefined);

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: () => true,
    workspace: mockWorkspace,
    repository: { scopeId: "device-preview-v1" },
    saving: false,
    error: null,
    clearError: jest.fn(),
    createPlace: jest.fn(),
    createAsset: mockCreateAsset
  })
}));

jest.mock("@/accessibility/useReduceMotionPreference", () => ({
  useReduceMotionPreference: () => false
}));

jest.mock("@/feedback/tactileFeedback", () => ({
  __esModule: true,
  playTactileFeedback: (
    kind: string,
    options: { readonly reduceMotion: boolean }
  ) => mockPlayTactileFeedback(kind, options)
}));

jest.mock("@/components/PlacePinEditor", () => ({
  PlacePinEditor: () => null
}));

jest.mock("@/i18n/copy", () => ({
  useCopy: () => ({
    language: "en",
    rtl: false,
    text: {}
  })
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

describe("Quick Passport validation and step accessibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps Continue available and exposes recoverable errors on press", async () => {
    const screen = await render(<CaptureScreen />);

    const continueButton = screen.getByRole("button", {
      name: "Continue"
    });
    expect(continueButton.props.accessibilityState).toEqual({
      disabled: false,
      busy: false
    });

    await fireEvent.press(continueButton);

    expect(
      screen.getByText("Name the item so you can find it again.")
    ).toBeTruthy();
    expect(
      screen.getByText("Choose the category that fits this item.")
    ).toBeTruthy();
    expect(screen.getByLabelText("Item name").props["aria-invalid"]).toBe(
      true
    );

    await fireEvent.changeText(
      screen.getByLabelText("Item name"),
      "GMT-Master II"
    );
    await fireEvent.press(continueButton);

    expect(
      screen.getByLabelText("Item category").props.accessibilityHint
    ).toBe("Choose the category that fits this item.");
  });

  it("updates the single step announcement target and exposes the location error", async () => {
    const screen = await render(<CaptureScreen />);
    const initialStepHeader = screen
      .getAllByLabelText("1 of 4 · Details")
      .find((node) => node.props.accessibilityRole === "header");
    expect(initialStepHeader?.props.accessibilityLiveRegion).toBeUndefined();
    await fireEvent.changeText(
      screen.getByLabelText("Item name"),
      "GMT-Master II"
    );
    await fireEvent.press(screen.getByRole("radio", { name: "Watch" }));

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Continue"
      })
    );

    expect(screen.getByText("2 of 4 · Location")).toBeTruthy();
    const stepNodes = screen.getAllByLabelText("2 of 4 · Location");
    expect(
      stepNodes.filter(
        (node) => node.props.accessibilityRole === "header"
      )
    ).toHaveLength(1);

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Continue"
      })
    );

    expect(
      screen.getByText("Choose what you know about the item's location.")
    ).toBeTruthy();
    expect(
      screen.getByLabelText("What you know about the item's location").props
        .accessibilityHint
    ).toBe("Choose what you know about the item's location.");
  });

  it("returns a provider-boundary failure to its localized recovery step", async () => {
    const copy = getCaptureCopy("en");
    mockCreateAsset.mockRejectedValueOnce(
      new AssetMutationValidationError({
        code: "ASSET_FILE_SIZE_INVALID",
        field: "evidence",
        fileRole: "evidence"
      })
    );
    const screen = await render(<CaptureScreen />);

    await fireEvent.changeText(
      screen.getByLabelText("Item name"),
      "Travel watch"
    );
    await fireEvent.press(screen.getByRole("radio", { name: "Watch" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue" })
    );
    await fireEvent.press(screen.getByText("I don't know yet"));
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue" })
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Skip for now" })
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Save Passport" })
    );

    expect(screen.getByTestId("capture-step-2")).toBeTruthy();
    expect(
      screen.getByText(
        `${copy.documentFailed}. ${copy.documentFailedRecovery}`
      )
    ).toBeTruthy();
    expect(mockCreateAsset).toHaveBeenCalledTimes(1);
  });

  it("lets a user jump directly from Review to each editable step", async () => {
    const copy = getCaptureCopy("en");
    const screen = await render(<CaptureScreen />);

    await fireEvent.changeText(
      screen.getByLabelText(copy.assetName),
      "Travel watch"
    );
    await fireEvent.press(screen.getByRole("radio", { name: "Watch" }));
    await fireEvent.press(
      screen.getByRole("button", { name: copy.continue })
    );
    await fireEvent.press(screen.getByText(copy.unknown));
    await fireEvent.press(
      screen.getByRole("button", { name: copy.continue })
    );
    await fireEvent.press(
      screen.getByRole("button", { name: copy.skip })
    );

    expect(screen.getByTestId("capture-step-3")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${copy.editIdentity}`)
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${copy.editPhoto}`)
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${copy.editLocation}`)
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${copy.editProof}`)
      })
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", {
        name: new RegExp(`^${copy.editLocation}`)
      })
    );
    expect(screen.getByTestId("capture-step-1")).toBeTruthy();
  });

  it("keeps Place-pin debt explicit and actionable from Review", async () => {
    const copy = getCaptureCopy("en");
    const place = mockWorkspace.places[0]!;
    const room = place.rooms[0]!;
    const screen = await render(<CaptureScreen />);

    await fireEvent.changeText(
      screen.getByLabelText(copy.assetName),
      "Travel watch"
    );
    await fireEvent.press(screen.getByRole("radio", { name: "Watch" }));
    await fireEvent.press(
      screen.getByRole("button", { name: copy.continue })
    );
    await fireEvent.press(
      screen.getByText(copy.exactSpot)
    );
    await fireEvent.press(
      screen.getByText(place.name)
    );
    await fireEvent.press(
      screen.getByText(room.name)
    );
    await fireEvent.press(
      screen.getByRole("button", { name: copy.continue })
    );
    await fireEvent.press(
      screen.getByRole("button", { name: copy.skip })
    );

    const debt = screen.getByTestId("capture-review-place-pin-debt");
    const alert = screen.getByTestId("capture-review-place-pin-alert");
    const action = screen.getByTestId(
      "capture-review-place-pin-action"
    );
    expect(debt).toBeTruthy();
    expect(alert.props.accessibilityRole).toBe("alert");
    expect(screen.getByText(copy.placePinDebtTitle)).toBeTruthy();
    expect(
      screen.getByText(new RegExp(copy.placeNeedsDetail))
    ).toBeTruthy();
    expect(action.props.accessibilityLabel).toBe(copy.reviewPlacePin);
    expect(action.props.accessibilityHint).toBe(
      copy.reviewPlacePinHint
    );

    await fireEvent.press(action);
    expect(mockRouter.push).toHaveBeenCalledWith(
      `/place-pin?placeId=${encodeURIComponent(place.id)}`
    );
  });

  it("saves indoor detail as needs-detail while the Place pin is unconfirmed", async () => {
    const copy = getCaptureCopy("en");
    const place = mockWorkspace.places[0]!;
    const room = place.rooms[0]!;
    let resolveCreateAsset!: (asset: { id: string }) => void;
    mockCreateAsset.mockReturnValueOnce(
      new Promise<{ id: string }>((resolve) => {
        resolveCreateAsset = resolve;
      })
    );
    const screen = await render(<CaptureScreen />);

    await fireEvent.changeText(
      screen.getByLabelText(copy.assetName),
      "Travel watch"
    );
    await fireEvent.press(screen.getByRole("radio", { name: "Watch" }));
    await fireEvent.press(
      screen.getByRole("button", { name: copy.continue })
    );
    await fireEvent.press(screen.getByText(copy.exactSpot));
    await fireEvent.press(screen.getByText(place.name));
    await fireEvent.press(screen.getByText(room.name));
    await fireEvent.press(
      screen.getByRole("button", { name: copy.continue })
    );
    await fireEvent.press(
      screen.getByRole("button", { name: copy.skip })
    );
    await fireEvent.press(
      screen.getByRole("button", { name: copy.savePassport })
    );

    await waitFor(() =>
      expect(mockCreateAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          locationStatus: "needs-detail",
          placeId: place.id,
          roomId: room.id
        })
      )
    );
    expect(mockPlayTactileFeedback).not.toHaveBeenCalled();

    resolveCreateAsset({ id: "asset-location-truth" });

    await waitFor(() =>
      expect(mockPlayTactileFeedback).toHaveBeenCalledWith(
        "success",
        { reduceMotion: false }
      )
    );
  });
});
