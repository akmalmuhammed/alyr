import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";

import CaptureScreen from "../app/capture";
import { createWorkspace } from "@/domain/sample";

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn()
};
const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  canGoBack: jest.fn(() => false),
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
    repository: { scopeId: "device-preview-v1" },
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

const getItem = jest.mocked(SecureStore.getItemAsync);
const setItem = jest.mocked(SecureStore.setItemAsync);
const deleteItem = jest.mocked(SecureStore.deleteItemAsync);

describe("Quick Passport protected-draft failure recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue();
    deleteItem.mockResolvedValue();
  });

  it("blocks editing on a read error and retries restoration explicitly", async () => {
    getItem.mockRejectedValueOnce(new Error("keychain read failed"));
    const screen = await render(<CaptureScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("capture-draft-read-error")).toBeTruthy();
    });
    expect(
      screen.getByText(
        "The protected draft could not be restored. Try again before continuing."
      )
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Try restoring draft again"
      })
    );
    await waitFor(() => {
      expect(screen.getByTestId("capture-step-0")).toBeTruthy();
    });
    expect(getItem).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  it("surfaces an autosave error and retries the current draft state", async () => {
    const screen = await render(<CaptureScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("capture-step-0")).toBeTruthy();
    });
    setItem.mockRejectedValueOnce(new Error("keychain write failed"));

    await fireEvent.changeText(
      screen.getByLabelText("Item name"),
      "Travel watch"
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("capture-draft-persistence-error")
      ).toBeTruthy();
    });
    expect(
      screen.getByText(
        "Your latest draft changes are not protected yet. Try saving the draft again."
      )
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Try again" })
    );
    await waitFor(() => {
      expect(
        screen.queryByTestId("capture-draft-persistence-error")
      ).toBeNull();
    });
    expect(setItem).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  it("surfaces an empty-draft delete error and retries the scoped clear", async () => {
    deleteItem.mockRejectedValueOnce(
      new Error("keychain delete failed")
    );
    const screen = await render(<CaptureScreen />);

    await waitFor(() => {
      expect(
        screen.getByTestId("capture-draft-persistence-error")
      ).toBeTruthy();
    });
    expect(
      screen.getByText(
        "The protected draft could not be cleared. Your saved record is unchanged; try finishing again."
      )
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Try again" })
    );
    await waitFor(() => {
      expect(
        screen.queryByTestId("capture-draft-persistence-error")
      ).toBeNull();
    });
    expect(deleteItem).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });
});
