import {
  fireEvent,
  render
} from "@testing-library/react-native";

import CaptureScreen from "../app/capture";
import { createWorkspace } from "@/domain/sample";

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
    expect(screen.getByLabelText("Asset name").props["aria-invalid"]).toBe(
      true
    );

    await fireEvent.changeText(
      screen.getByLabelText("Asset name"),
      "GMT-Master II"
    );
    await fireEvent.press(continueButton);

    expect(
      screen.getByLabelText("Asset category").props.accessibilityHint
    ).toBe("Choose the category that fits this item.");
  });

  it("updates the single step announcement target and exposes the location error", async () => {
    const screen = await render(<CaptureScreen />);
    const initialStepHeader = screen
      .getAllByLabelText("1 of 4 · Details")
      .find((node) => node.props.accessibilityRole === "header");
    expect(initialStepHeader?.props.accessibilityLiveRegion).toBeUndefined();
    await fireEvent.changeText(
      screen.getByLabelText("Asset name"),
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
});
