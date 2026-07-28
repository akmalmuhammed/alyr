import {
  fireEvent,
  render
} from "@testing-library/react-native";
import {
  API_ERROR_VERSION,
  type ApiErrorCode,
  type ContractError
} from "@alyr/contracts";
import type { PropsWithChildren } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet
} from "react-native";
import {
  SafeAreaProvider
} from "react-native-safe-area-context";

import {
  HouseholdRosterStatus
} from "../app/(tabs)/family";
import MemberAccessScreen from "../app/member-access";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import {
  HOUSEHOLD_ADMIN_COPY,
  householdAccessErrorMessage
} from "@/i18n/householdAdminCopy";
import { colors } from "@/theme/tokens";

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn()
};
const mockRefreshHouseholdAccess = jest.fn(async () => false);
const mockAuthFlow = {
  current: {
    busy: false,
    householdAccessSnapshot: null,
    householdAccessError: {
      errorVersion: API_ERROR_VERSION,
      code: "OFFLINE",
      message: "provider_internal: postgres.rls.household_42",
      retryable: true
    } as ContractError,
    refreshHouseholdAccess: mockRefreshHouseholdAccess,
    changeHouseholdMemberRole: jest.fn(async () => false),
    revokeHouseholdMember: jest.fn(async () => false),
    cancelPendingHouseholdInvite: jest.fn(async () => false),
    transferHouseholdOwnership: jest.fn(async () => false)
  }
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({
    kind: "member",
    id: "missing-member"
  }),
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthFlow.current
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 20, right: 0, bottom: 16, left: 0 }
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

const errorCodes: readonly ApiErrorCode[] = [
  "AUTHENTICATION_REQUIRED",
  "AUTHORIZATION_DENIED",
  "CONFLICT_REQUIRES_REVIEW",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_COMMAND",
  "INVALID_CURSOR",
  "INVALID_FILE",
  "NOT_FOUND",
  "OFFLINE",
  "QUOTA_EXCEEDED",
  "RATE_LIMITED",
  "SESSION_EXPIRED",
  "STORAGE_UNAVAILABLE",
  "UNSUPPORTED_CONTRACT_VERSION",
  "VALIDATION_FAILED"
];

function contractError(
  code: ApiErrorCode,
  retryable = true
): ContractError {
  return {
    errorVersion: API_ERROR_VERSION,
    code,
    message: "provider_internal: do-not-render",
    retryable
  };
}

describe("household access presentation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps every stable code to local English and Arabic copy without provider text", () => {
    for (const language of ["en", "ar"] as const) {
      for (const code of errorCodes) {
        const message = householdAccessErrorMessage(
          contractError(code),
          language
        );
        expect(message).toContain(
          HOUSEHOLD_ADMIN_COPY[language].errorByCode[code]
        );
        expect(message).toContain(
          HOUSEHOLD_ADMIN_COPY[language].errorRetry
        );
        expect(message).not.toContain("provider_internal");
      }
    }
  });

  it("uses a localized generic fallback and non-retry guidance for an unknown code", () => {
    const message = householdAccessErrorMessage(
      {
        code: "PROVIDER_PRIVATE_FAILURE",
        retryable: false
      },
      "ar"
    );

    expect(message).toBe(
      `${HOUSEHOLD_ADMIN_COPY.ar.errorFallback} ${HOUSEHOLD_ADMIN_COPY.ar.errorReview}`
    );
  });

  it("renders a warning icon and tone for errors, never the success icon", async () => {
    const error = contractError("OFFLINE");
    const screen = await render(
      <HouseholdRosterStatus
        error={error}
        onRefresh={jest.fn()}
        status="error"
      />,
      { wrapper: localeWrapper("en") }
    );
    const status = screen.getByTestId("family-access-status");
    const message = householdAccessErrorMessage(error, "en");

    expect(status.props.accessibilityLabel).toBe(message);
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(status.props.accessibilityRole).toBe("alert");
    expect(status.props.accessibilityState).toEqual({ busy: false });
    expect(
      screen.getByTestId("family-access-warning-icon", {
        includeHiddenElements: true
      })
    ).toBeTruthy();
    expect(
      screen.queryByTestId("family-access-ready-icon", {
        includeHiddenElements: true
      })
    ).toBeNull();
    expect(
      StyleSheet.flatten(status.props.style).backgroundColor
    ).toBe(colors.warningQuiet);
    expect(screen.queryByText(error.message)).toBeNull();
  });

  it("exposes refreshing as a polite busy progress status and disables repeat refresh", async () => {
    const onRefresh = jest.fn();
    const screen = await render(
      <HouseholdRosterStatus
        error={null}
        onRefresh={onRefresh}
        status="refreshing"
      />,
      { wrapper: localeWrapper("en") }
    );
    const status = screen.getByTestId("family-access-status");
    const refresh = screen.getByRole("button", {
      name: HOUSEHOLD_ADMIN_COPY.en.refreshing
    });

    expect(status.props.accessibilityLabel).toBe(
      HOUSEHOLD_ADMIN_COPY.en.refreshing
    );
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(status.props.accessibilityRole).toBe("progressbar");
    expect(status.props.accessibilityState).toEqual({ busy: true });
    expect(
      screen.getByTestId("family-access-progress-icon", {
        includeHiddenElements: true
      })
    ).toBeTruthy();
    expect(refresh.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(refresh);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("announces asynchronous roster state changes on iOS", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      Platform,
      "OS"
    );
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios"
    });
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(jest.fn());

    try {
      const screen = await render(
        <HouseholdRosterStatus
          error={null}
          onRefresh={jest.fn()}
          status="refreshing"
        />,
        { wrapper: localeWrapper("en") }
      );
      expect(announce).toHaveBeenCalledWith(
        HOUSEHOLD_ADMIN_COPY.en.refreshing
      );

      await screen.rerender(
        <HouseholdRosterStatus
          error={null}
          onRefresh={jest.fn()}
          status="ready"
        />
      );
      expect(announce).toHaveBeenLastCalledWith(
        HOUSEHOLD_ADMIN_COPY.en.refreshed
      );
    } finally {
      announce.mockRestore();
      if (platformDescriptor) {
        Object.defineProperty(Platform, "OS", platformDescriptor);
      }
    }
  });

  it("reserves the success icon for a ready roster and keeps idle neutral", async () => {
    const ready = await render(
      <HouseholdRosterStatus
        error={null}
        onRefresh={jest.fn()}
        status="ready"
      />,
      { wrapper: localeWrapper("en") }
    );

    expect(
      ready.getByTestId("family-access-ready-icon", {
        includeHiddenElements: true
      })
    ).toBeTruthy();
    expect(
      ready.getByTestId("family-access-status").props.accessibilityRole
    ).toBe("summary");
    await ready.unmount();

    const idle = await render(
      <HouseholdRosterStatus
        error={null}
        onRefresh={jest.fn()}
        status="idle"
      />,
      { wrapper: localeWrapper("en") }
    );
    expect(
      idle.getByTestId("family-access-idle-icon", {
        includeHiddenElements: true
      })
    ).toBeTruthy();
    expect(
      idle.queryByTestId("family-access-ready-icon", {
        includeHiddenElements: true
      })
    ).toBeNull();
  });

  it("renders the Arabic status, recovery action and RTL warning treatment", async () => {
    const error = contractError("SESSION_EXPIRED", false);
    const onRefresh = jest.fn();
    const screen = await render(
      <HouseholdRosterStatus
        error={error}
        onRefresh={onRefresh}
        status="error"
      />,
      { wrapper: localeWrapper("ar") }
    );
    const message = householdAccessErrorMessage(error, "ar");
    const status = screen.getByTestId("family-access-status");

    expect(screen.getByText(message)).toBeTruthy();
    expect(status.props.accessibilityLabel).toBe(message);
    expect(StyleSheet.flatten(status.props.style).flexDirection).toBe(
      "row-reverse"
    );

    fireEvent.press(
      screen.getByRole("button", {
        name: HOUSEHOLD_ADMIN_COPY.ar.refresh
      })
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it.each(["en", "ar"] as const)(
    "keeps provider details out of the %s member-access recovery screen",
    async (language) => {
      const screen = await render(<MemberAccessScreen />, {
        wrapper: localeWrapper(language)
      });
      const expected = householdAccessErrorMessage(
        mockAuthFlow.current.householdAccessError,
        language
      );

      expect(screen.getByText(expected)).toBeTruthy();
      expect(
        screen.queryByText(
          mockAuthFlow.current.householdAccessError.message
        )
      ).toBeNull();
      expect(
        screen.getByText(expected).props.accessibilityRole
      ).toBe("alert");
    }
  );
});
