import {
  cleanup,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import PersonalStartScreen from "../app/personal-start";
import { createWorkspace } from "@/domain/sample";
import { SAMPLE_CONVERSION_COPY } from "@/i18n/sampleConversionCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn()
};
const mockRedirect = jest.fn(
  (_props: { readonly href: string }) => null
);
let mockMode: "preview" | "supabase" = "preview";
let mockWorkspace = createWorkspace("sample");
const mockReplaceWithPersonalWorkspace = jest.fn(
  async () => undefined
);

jest.mock("expo-router", () => ({
  Redirect: (props: { readonly href: string }) =>
    mockRedirect(props),
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => ({ mode: mockMode })
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    workspace: mockWorkspace,
    replaceWithPersonalWorkspace:
      mockReplaceWithPersonalWorkspace
  })
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, right: 0, bottom: 34, left: 0 }
};

function wrapper(language: "en" | "ar") {
  return function TestWrapper({ children }: PropsWithChildren) {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <LocaleProvider initialLanguage={language}>
          {children}
        </LocaleProvider>
      </SafeAreaProvider>
    );
  };
}

describe("sample-to-personal preview journey", () => {
  afterEach(async () => {
    await cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockMode = "preview";
    mockWorkspace = createWorkspace("sample");
    mockRouter.canGoBack.mockReturnValue(true);
    mockReplaceWithPersonalWorkspace.mockResolvedValue(undefined);
  });

  it("names the consequence before replacing the sample, then offers item, Place and Today", async () => {
    const copy = SAMPLE_CONVERSION_COPY.en;
    const screen = await render(<PersonalStartScreen />, {
      wrapper: wrapper("en")
    });

    expect(screen.getByText(copy.reviewTitle)).toBeTruthy();
    expect(screen.getByText(copy.sampleRemovedTitle)).toBeTruthy();
    expect(screen.getByText(copy.localOnlyBody)).toBeTruthy();
    expect(mockReplaceWithPersonalWorkspace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText(copy.confirm));

    await waitFor(() =>
      expect(
        screen.getByText(copy.readyTitle)
      ).toBeTruthy()
    );
    expect(mockReplaceWithPersonalWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.getByText(copy.localTruth)).toBeTruthy();

    await fireEvent.press(
      screen.getByTestId("personal-start-item")
    );
    expect(mockRouter.replace).toHaveBeenLastCalledWith({
      pathname: "/capture",
      params: { returnTo: "today" }
    });

    await fireEvent.press(
      screen.getByTestId("personal-start-place")
    );
    expect(mockRouter.replace).toHaveBeenLastCalledWith({
      pathname: "/capture",
      params: { intent: "place", returnTo: "today" }
    });

    await fireEvent.press(screen.getByText(copy.goToday));
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/");
  });

  it("keeps the sample available and shows recovery copy when conversion fails", async () => {
    const copy = SAMPLE_CONVERSION_COPY.en;
    mockReplaceWithPersonalWorkspace.mockRejectedValueOnce(
      new Error("storage unavailable")
    );
    const screen = await render(<PersonalStartScreen />, {
      wrapper: wrapper("en")
    });

    await fireEvent.press(screen.getByText(copy.confirm));

    expect(await screen.findByText(copy.failure)).toBeTruthy();
    expect(screen.getByText(copy.reviewTitle)).toBeTruthy();
    expect(screen.queryByText(copy.readyTitle)).toBeNull();
  });

  it("renders native Arabic copy and RTL alignment through both stages", async () => {
    const copy = SAMPLE_CONVERSION_COPY.ar;
    const screen = await render(<PersonalStartScreen />, {
      wrapper: wrapper("ar")
    });

    const reviewTitle = screen.getByText(copy.reviewTitle);
    expect(reviewTitle).toBeTruthy();
    expect(
      StyleSheet.flatten(reviewTitle.props.style).writingDirection
    ).toBe("rtl");

    await fireEvent.press(screen.getByText(copy.confirm));
    const readyTitle = await screen.findByText(copy.readyTitle);
    expect(
      StyleSheet.flatten(readyTitle.props.style).writingDirection
    ).toBe("rtl");
    expect(screen.getByText(copy.firstPlaceBody)).toBeTruthy();
  });

  it("returns signed and already-personal records to Today without changing them", async () => {
    mockMode = "supabase";
    const screen = await render(<PersonalStartScreen />, {
      wrapper: wrapper("en")
    });

    expect(
      screen.queryByTestId("personal-start-screen")
    ).toBeNull();
    expect(mockRedirect).toHaveBeenCalledWith({ href: "/" });
    expect(mockReplaceWithPersonalWorkspace).not.toHaveBeenCalled();
  });
});
