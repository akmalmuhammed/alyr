import {
  fireEvent,
  render,
  within,
  waitFor
} from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";

import { getPortfolioExperienceCopy } from "@/i18n/portfolioCopy";

let mockLanguage: "en" | "ar" = "en";
const mockCreateLiability = jest.fn();
const mockRouter = {
  back: jest.fn(),
  replace: jest.fn()
};
const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn(),
  setOptions: jest.fn()
};

jest.mock("expo-router", () => ({
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter
}));

jest.mock("@/i18n/coreJourneyCopy", () => {
  const actual = jest.requireActual("@/i18n/coreJourneyCopy");
  return {
    ...actual,
    useCoreJourneyCopy: () => ({
      language: mockLanguage,
      rtl: mockLanguage === "ar"
    })
  };
});

jest.mock("@/privacy/PortfolioPrivacyProvider", () => ({
  usePortfolioPrivacy: () => ({
    amountsHidden: true
  })
}));

jest.mock("@/state/WorkspaceProvider", () => {
  const { createWorkspace } = jest.requireActual("@/domain/sample");
  return {
    useWorkspace: () => ({
      can: (capability: string) => capability === "liability.write",
      clearError: jest.fn(),
      createLiability: mockCreateLiability,
      error: null,
      saving: false,
      workspace: createWorkspace("personal")
    })
  };
});

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

import LiabilityCreateRoute from "../app/liability-create";

describe("liability form accessibility", () => {
  beforeEach(() => {
    mockLanguage = "en";
    jest.clearAllMocks();
    mockCreateLiability.mockResolvedValue({ id: "liability-created" });
  });

  it("exposes semantic financial controls without revealing typed amounts", async () => {
    const copy = getPortfolioExperienceCopy("en");
    const screen = await render(<LiabilityCreateRoute />);
    const name = screen.getByTestId("liability-name");
    const category = screen.getByTestId("liability-category-list");
    const mortgage = screen.getByTestId("liability-category");
    const amount = screen.getByTestId("liability-amount");
    const asOf = screen.getByTestId("liability-as-of");
    const save = screen.getByTestId("liability-save");

    expect(name.props.accessibilityLabel).toBe(copy.create.name);
    expect(category.props.accessibilityRole).toBe("radiogroup");
    expect(mortgage.props.accessibilityRole).toBe("radio");
    expect(mortgage.props.accessibilityState).toMatchObject({
      checked: false
    });
    expect(amount.props.accessibilityLabel).toBe(copy.create.amount);
    expect(amount.props.accessibilityHint).toBe(
      `${copy.create.amountDescription} QAR`
    );
    expect(amount.props.secureTextEntry).toBe(true);
    expect(asOf.props.accessibilityLabel).toBe(copy.create.asOf);
    expect(save.props.accessibilityRole).toBe("button");
    expect(
      StyleSheet.flatten(save.props.style).minHeight
    ).toBeGreaterThanOrEqual(44);
    await screen.unmount();
  });

  it("announces validation and leaves persistence untouched when required input is missing", async () => {
    const copy = getPortfolioExperienceCopy("en");
    const screen = await render(<LiabilityCreateRoute />);

    await fireEvent.press(screen.getByTestId("liability-save"));

    expect(screen.getByText(copy.create.nameError)).toBeTruthy();
    expect(screen.getByText(copy.create.categoryError)).toBeTruthy();
    expect(mockCreateLiability).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("announces and focuses the category choice when other required fields are valid", async () => {
    const copy = getPortfolioExperienceCopy("en");
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    const screen = await render(<LiabilityCreateRoute />);

    await fireEvent.changeText(
      screen.getByTestId("liability-name"),
      "Home mortgage"
    );
    await fireEvent.changeText(
      screen.getByTestId("liability-amount"),
      "250000"
    );
    await fireEvent.press(screen.getByTestId("liability-save"));

    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(copy.create.categoryError);
    });
    expect(screen.getByText(copy.create.categoryError)).toBeTruthy();
    expect(mockCreateLiability).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("requires an explicit category and keeps uncommon categories behind a clear expansion", async () => {
    const copy = getPortfolioExperienceCopy("en");
    const screen = await render(<LiabilityCreateRoute />);

    for (const testID of [
      "liability-category",
      "liability-category-vehicle-loan",
      "liability-category-credit-card",
      "liability-category-personal-loan"
    ]) {
      expect(screen.getByTestId(testID)).toBeTruthy();
    }
    expect(
      screen.queryByTestId("liability-category-education-loan")
    ).toBeNull();
    expect(screen.queryByTestId("liability-category-tax")).toBeNull();
    expect(screen.getByText(copy.create.moreCategories)).toBeTruthy();

    const mortgage = screen.getByTestId("liability-category");
    const vehicle = screen.getByTestId(
      "liability-category-vehicle-loan"
    );
    const creditCard = screen.getByTestId(
      "liability-category-credit-card"
    );
    const personal = screen.getByTestId(
      "liability-category-personal-loan"
    );
    expect(
      within(mortgage).getByTestId(
        "phosphor-react-native-house-regular"
      )
    ).toBeTruthy();
    expect(
      within(vehicle).getByTestId("phosphor-react-native-car-regular")
    ).toBeTruthy();
    expect(
      within(creditCard).getByTestId(
        "phosphor-react-native-credit-card-regular"
      )
    ).toBeTruthy();
    expect(
      within(personal).getByTestId("phosphor-react-native-bank-regular")
    ).toBeTruthy();

    const toggle = screen.getByTestId("liability-category-toggle");
    expect(toggle.props.accessibilityState).toMatchObject({
      expanded: false
    });
    await fireEvent.press(toggle);

    expect(
      screen.getByTestId("liability-category-education-loan")
    ).toBeTruthy();
    expect(screen.getByTestId("liability-category-tax")).toBeTruthy();
    expect(screen.getByText(copy.create.fewerCategories)).toBeTruthy();
    expect(
      screen.getByTestId("liability-category-toggle").props
        .accessibilityState
    ).toMatchObject({ expanded: true });
    await fireEvent.press(
      screen.getByTestId("liability-category-education-loan")
    );
    await fireEvent.press(
      screen.getByTestId("liability-category-toggle")
    );

    expect(
      screen.getByTestId("liability-category-education-loan")
    ).toBeTruthy();
    expect(
      screen.getByTestId("liability-category-toggle").props
        .accessibilityState
    ).toMatchObject({ expanded: false });
    expect(screen.getByText(copy.create.moreCategories)).toBeTruthy();
    await screen.unmount();
  });

  it("offers three common currencies before the manual currency path", async () => {
    const screen = await render(<LiabilityCreateRoute />);

    expect(screen.getByTestId("liability-currency")).toBeTruthy();
    expect(screen.getByTestId("liability-currency-USD")).toBeTruthy();
    expect(screen.getByTestId("liability-currency-EUR")).toBeTruthy();
    expect(screen.queryByTestId("liability-currency-GBP")).toBeNull();
    await screen.unmount();
  });

  it("persists an exact dated balance through the local-first command", async () => {
    const screen = await render(<LiabilityCreateRoute />);
    const asOf = screen.getByTestId("liability-as-of").props.value as string;

    await fireEvent.changeText(
      screen.getByTestId("liability-name"),
      "Home mortgage"
    );
    await fireEvent.changeText(
      screen.getByTestId("liability-amount"),
      "250000"
    );
    await fireEvent.press(screen.getByTestId("liability-category"));
    await fireEvent.press(screen.getByTestId("liability-save"));

    await waitFor(() => {
      expect(mockCreateLiability).toHaveBeenCalledWith({
        name: "Home mortgage",
        kind: "mortgage",
        amountMinor: 25_000_000,
        currency: "QAR",
        asOf
      });
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/liability/liability-created"
    );
    await screen.unmount();
  });

  it("uses Arabic labels and RTL semantics for every required field", async () => {
    mockLanguage = "ar";
    const copy = getPortfolioExperienceCopy("ar");
    const screen = await render(<LiabilityCreateRoute />);

    for (const [testID, label] of [
      ["liability-name", copy.create.name],
      ["liability-amount", copy.create.amount],
      ["liability-as-of", copy.create.asOf]
    ] as const) {
      const control = screen.getByTestId(testID);
      expect(control.props.accessibilityLabel).toBe(label);
      expect(control.props.accessibilityLabel).toMatch(
        /[\u0600-\u06ff]/u
      );
    }
    expect(
      screen.getByTestId("liability-category-list").props
        .accessibilityLabel
    ).toMatch(/[\u0600-\u06ff]/u);
    await screen.unmount();
  });
});
