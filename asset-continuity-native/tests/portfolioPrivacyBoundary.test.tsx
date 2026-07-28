import * as SecureStore from "expo-secure-store";
import {
  act,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import {
  AppState,
  type AppStateStatus,
  Pressable,
  Text
} from "react-native";

import {
  PortfolioPrivacyProvider,
  portfolioVisibilityStorageKey,
  usePortfolioPrivacy,
  valueVisibilityScopeForSession,
  type ValueVisibilityScope
} from "@/privacy/PortfolioPrivacyProvider";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex" },
  digestStringAsync: jest.fn(async (_algorithm, input: string) =>
    input.includes("household-b") ? "b".repeat(64) : "a".repeat(64)
  )
}));

const getItem = jest.mocked(SecureStore.getItemAsync);
const setItem = jest.mocked(SecureStore.setItemAsync);

function VisibilityProbe() {
  const {
    amountsHidden,
    toggleAmountsHidden,
    visibility
  } = usePortfolioPrivacy();
  return (
    <Pressable
      accessibilityLabel={visibility}
      accessibilityRole="button"
      accessibilityState={{ checked: amountsHidden }}
      onPress={toggleAmountsHidden}
      testID="visibility-probe"
    >
      <Text>{visibility}</Text>
    </Pressable>
  );
}

function Boundary({
  scope
}: {
  readonly scope: ValueVisibilityScope | null;
}) {
  return (
    <PortfolioPrivacyProvider scope={scope}>
      <VisibilityProbe />
    </PortfolioPrivacyProvider>
  );
}

describe("recorded-value account and household boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts hidden and remains hidden while no account boundary is active", async () => {
    const screen = await render(<Boundary scope={null} />);

    expect(screen.getByTestId("visibility-probe").props.accessibilityLabel).toBe(
      "hidden"
    );
    await fireEvent.press(screen.getByTestId("visibility-probe"));
    expect(screen.getByTestId("visibility-probe").props.accessibilityLabel).toBe(
      "hidden"
    );
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("persists signed-native sample visibility under a key separate from every account", async () => {
    const sampleScope = valueVisibilityScopeForSession(
      "supabase",
      null,
      "native-secure"
    );
    const accountScope: ValueVisibilityScope = {
      kind: "account-household",
      accountId: "account-a",
      householdId: "household-a"
    };

    expect(sampleScope).toEqual({ kind: "signed-sample" });
    const sampleKey = await portfolioVisibilityStorageKey(sampleScope!);
    const accountKey = await portfolioVisibilityStorageKey(accountScope);
    expect(sampleKey).toContain("signed-sample-v1");
    expect(sampleKey).not.toBe(accountKey);
  });

  it("isolates saved visibility by account and household and closes on transition", async () => {
    const scopeA: ValueVisibilityScope = {
      kind: "account-household",
      accountId: "account-a",
      householdId: "household-a"
    };
    const scopeB: ValueVisibilityScope = {
      kind: "account-household",
      accountId: "account-a",
      householdId: "household-b"
    };
    const keyA = await portfolioVisibilityStorageKey(scopeA);
    const keyB = await portfolioVisibilityStorageKey(scopeB);
    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toContain(scopeA.accountId);
    expect(keyA).not.toContain(scopeA.householdId);

    getItem.mockImplementation(async (key) =>
      key === keyA ? "visible" : "hidden"
    );

    const screen = await render(<Boundary scope={scopeA} />);
    await waitFor(() => {
      expect(
        screen.getByTestId("visibility-probe").props.accessibilityLabel
      ).toBe("visible");
    });

    await screen.rerender(<Boundary scope={scopeB} />);

    // The render for the next household is closed before its async preference
    // read completes, so the previous household never flashes through.
    expect(screen.getByTestId("visibility-probe").props.accessibilityLabel).toBe(
      "hidden"
    );
    await waitFor(() => {
      expect(getItem).toHaveBeenCalledWith(keyB);
    });

    await fireEvent.press(screen.getByTestId("visibility-probe"));
    expect(screen.getByTestId("visibility-probe").props.accessibilityLabel).toBe(
      "visible"
    );
    await waitFor(() => {
      expect(setItem).toHaveBeenCalledWith(keyB, "visible");
    });

    await screen.rerender(<Boundary scope={null} />);
    expect(screen.getByTestId("visibility-probe").props.accessibilityLabel).toBe(
      "hidden"
    );
  });

  it.each<AppStateStatus>(["inactive", "background"])(
    "re-hides every recorded amount as soon as the app becomes %s",
    async (nextState) => {
      let appStateListener:
        | ((state: AppStateStatus) => void)
        | null = null;
      jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((_event, listener) => {
          appStateListener = listener;
          return { remove: jest.fn() };
        });
      const scope: ValueVisibilityScope = {
        kind: "account-household",
        accountId: "account-a",
        householdId: "household-a"
      };
      const screen = await render(<Boundary scope={scope} />);
      await waitFor(() => {
        expect(getItem).toHaveBeenCalledTimes(1);
      });

      await fireEvent.press(screen.getByTestId("visibility-probe"));
      expect(
        screen.getByTestId("visibility-probe").props.accessibilityLabel
      ).toBe("visible");

      await act(async () => {
        appStateListener?.(nextState);
      });

      expect(
        screen.getByTestId("visibility-probe").props.accessibilityLabel
      ).toBe("hidden");
      await waitFor(() => {
        expect(setItem).toHaveBeenLastCalledWith(
          expect.stringContaining("alyr.portfolio.value-visibility.v2."),
          "hidden"
        );
      });
      await screen.unmount();
    }
  );
});
