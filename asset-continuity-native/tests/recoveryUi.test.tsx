import {
  act,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import { Alert } from "react-native";

import CreateRecoveryKitScreen from "../app/recovery-create";
import ImportRecoveryKitScreen from "../app/recovery-import";
import {
  createUnavailableRecoveryRuntime,
  RecoveryJourneyProvider,
  type RecoveryImportPreview,
  type RecoveryJourneyRuntime
} from "@/recovery";

const mockRouter = {
  replace: jest.fn()
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/i18n/copy", () => ({
  useCopy: () => ({
    language: "en",
    rtl: false,
    text: {}
  })
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: () => true
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

const preview: RecoveryImportPreview = {
  previewId: "preview-1",
  fileName: "ALYR-Recovery-2026-07-27.alyrkit",
  kitIdSuffix: "1234abcd",
  createdAt: "2026-07-27T10:00:00.000Z",
  workspaceSchemaVersion: 2,
  householdName: "West Bay home",
  itemCount: 8,
  placeCount: 2,
  proofCount: 6,
  attachmentCount: 5,
  containerSha256: "a".repeat(64),
  authenticated: true
};

function availableRuntime(
  overrides: Partial<RecoveryJourneyRuntime> = {}
): RecoveryJourneyRuntime {
  return {
    capability: {
      kind: "available",
      protection: "argon2id-aes-256-gcm"
    },
    create: jest.fn(async () => ({
      reference: "file:///kit.alyrkit",
      fileName: "ALYR-Recovery-2026-07-27.alyrkit",
      byteSize: 2048,
      sha256: "b".repeat(64),
      attachmentCount: 5,
      createdAt: "2026-07-27T10:00:00.000Z",
      verifiedAt: "2026-07-27T10:01:00.000Z",
      protection: "Argon2id + AES-256-GCM" as const,
      externalBackupConfirmedAt: null
    })),
    share: jest.fn(async () => undefined),
    listRecent: jest.fn(async () => []),
    confirmExternalBackup: jest.fn(async (reference: string) => ({
      reference,
      fileName: "ALYR-Recovery-2026-07-27.alyrkit",
      byteSize: 2048,
      createdAt: "2026-07-27T10:00:00.000Z",
      externalBackupConfirmedAt: "2026-07-27T10:02:00.000Z"
    })),
    chooseAndPreview: jest.fn(async () => preview),
    restore: jest.fn(async () => undefined),
    clearPreview: jest.fn(),
    ...overrides
  };
}

describe("Recovery Kit routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a clear fail-closed state in Expo Go", async () => {
    const runtime = createUnavailableRecoveryRuntime("expo-go-preview");
    const screen = await render(
      <RecoveryJourneyProvider runtime={runtime}>
        <CreateRecoveryKitScreen />
      </RecoveryJourneyProvider>
    );
    expect(
      screen.getByText("Recovery Kit is available in the installed ALYR app")
    ).toBeTruthy();
    expect(screen.queryByLabelText("Passphrase")).toBeNull();
    expect(screen.getByText(/device-grade encryption and protected storage/u))
      .toBeTruthy();
  });

  it("keeps a verified local kit unprotected until another copy is explicitly confirmed", async () => {
    const runtime = availableRuntime();
    const screen = await render(
      <RecoveryJourneyProvider runtime={runtime}>
        <CreateRecoveryKitScreen />
      </RecoveryJourneyProvider>
    );
    await fireEvent.changeText(
      screen.getByLabelText("Passphrase"),
      "a careful recovery phrase"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Confirm passphrase"),
      "different recovery phrase"
    );
    expect(
      screen.getAllByText("The two passphrases do not match.")
    ).toHaveLength(2);

    await fireEvent.changeText(
      screen.getByLabelText("Confirm passphrase"),
      "a careful recovery phrase"
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Create encrypted kit" })
    );
    await waitFor(() =>
      expect(runtime.create).toHaveBeenCalledWith(
        "a careful recovery phrase"
      )
    );
    expect(
      screen.getByText("Encrypted kit created on this device")
    ).toBeTruthy();
    expect(screen.getByText("Save another copy before leaving")).toBeTruthy();
    expect(screen.getByText("Argon2id + AES-256-GCM")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "I saved another copy" })
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Share encrypted kit" })
    );
    await waitFor(() =>
      expect(runtime.share).toHaveBeenCalledWith("file:///kit.alyrkit")
    );
    expect(
      screen.getByText("Did you save it somewhere else?")
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "I saved another copy" })
    );
    await waitFor(() =>
      expect(runtime.confirmExternalBackup).toHaveBeenCalledWith(
        "file:///kit.alyrkit"
      )
    );
    expect(screen.getByText("Recovery backup protected")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Share encrypted kit" })
    ).toBeNull();
  });

  it("previews before restore and requires typed plus system confirmation", async () => {
    const runtime = availableRuntime();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await render(
      <RecoveryJourneyProvider runtime={runtime}>
        <ImportRecoveryKitScreen />
      </RecoveryJourneyProvider>
    );
    await fireEvent.changeText(
      screen.getByLabelText("Recovery Kit passphrase"),
      "a careful recovery phrase"
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Choose kit and verify" })
    );
    await waitFor(() =>
      expect(runtime.chooseAndPreview).toHaveBeenCalledWith(
        "a careful recovery phrase"
      )
    );
    expect(screen.getByText("Kit decrypted and verified")).toBeTruthy();
    expect(screen.getByText("West Bay home")).toBeTruthy();

    const review = screen.getByRole("button", {
      name: "Review final replacement"
    });
    expect(review.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(
      screen.getByLabelText("Destructive confirmation"),
      "REPLACE"
    );
    expect(
      screen.getByRole("button", {
        name: "Review final replacement"
      }).props.accessibilityState.disabled
    ).toBe(false);
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Review final replacement"
      })
    );
    expect(alert).toHaveBeenCalledWith(
      "Replace this local workspace?",
      expect.stringContaining("West Bay home"),
      expect.any(Array)
    );
    const actions = alert.mock.calls[0]?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    await act(async () => {
      actions
        ?.find((action) => action.text === "Replace and restore")
        ?.onPress?.();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(runtime.restore).toHaveBeenCalledWith("preview-1", "REPLACE")
    );
  });
});
