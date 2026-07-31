import {
  act,
  render,
  waitFor
} from "@testing-library/react-native";
import { AppState, Text, type AppStateStatus } from "react-native";
import type {
  HouseholdStorageUsagePort,
  HouseholdStorageUsageResponse
} from "@alyr/contracts";

import type { VerifiedHouseholdAccess } from "@/auth/verifiedHouseholdAccess";
import { useFocusedHouseholdStorageUsage } from "@/vault/focusedHouseholdStorageUsage";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) =>
    jest.requireActual<typeof import("react")>("react").useEffect(
      callback,
      [callback]
    )
}));

const householdA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const householdB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function access(
  householdId: string,
  accountId = "account-a"
): VerifiedHouseholdAccess {
  return {
    accountId,
    householdId,
    membershipId: `membership-${accountId}`,
    role: "owner"
  };
}

function usage(
  householdId: string,
  usedBytes: number
): HouseholdStorageUsageResponse {
  return {
    householdId,
    source: "server-confirmed",
    usedBytes,
    allowanceBytes: 40 * 1024 * 1024,
    measuredAt: "2026-08-01T00:00:00.000Z"
  };
}

function success(value: HouseholdStorageUsageResponse) {
  return Promise.resolve({ ok: true as const, value });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function Harness({
  verifiedAccess,
  mode = "personal",
  requestPaused = false,
  refreshKey = "idle:never-attempted:never-synced",
  port
}: {
  readonly verifiedAccess: VerifiedHouseholdAccess | null;
  readonly mode?: "sample" | "personal";
  readonly requestPaused?: boolean;
  readonly refreshKey?: string;
  readonly port: HouseholdStorageUsagePort | null;
}) {
  const report = useFocusedHouseholdStorageUsage({
    access: verifiedAccess,
    workspaceMode: mode,
    requestPaused,
    refreshKey,
    port
  });
  return (
    <Text testID="household-storage-report">
      {report ? `${report.householdId}:${report.usedBytes}` : "unknown"}
    </Text>
  );
}

describe("focused household storage usage", () => {
  beforeEach(() => {
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "active"
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("makes zero calls for sample and request-paused workspaces", async () => {
    const getUsage = jest.fn(() => success(usage(householdA, 1)));
    const port: HouseholdStorageUsagePort = { getUsage };
    const sample = await render(
      <Harness
        mode="sample"
        port={port}
        verifiedAccess={access(householdA)}
      />
    );

    await act(async () => undefined);
    expect(getUsage).not.toHaveBeenCalled();
    expect(sample.getByTestId("household-storage-report").props.children)
      .toBe("unknown");

    await sample.rerender(
      <Harness
        mode="personal"
        port={port}
        requestPaused
        verifiedAccess={access(householdA)}
      />
    );
    await act(async () => undefined);
    expect(getUsage).not.toHaveBeenCalled();
  });

  it("clears and refetches when the active household changes", async () => {
    const first = deferred<Awaited<ReturnType<HouseholdStorageUsagePort["getUsage"]>>>();
    const getUsage = jest
      .fn<
        ReturnType<HouseholdStorageUsagePort["getUsage"]>,
        Parameters<HouseholdStorageUsagePort["getUsage"]>
      >()
      .mockReturnValueOnce(first.promise)
      .mockImplementationOnce(() => success(usage(householdB, 22)));
    const port: HouseholdStorageUsagePort = { getUsage };
    const screen = await render(
      <Harness port={port} verifiedAccess={access(householdA)} />
    );
    expect(screen.getByTestId("household-storage-report").props.children)
      .toBe("unknown");

    await screen.rerender(
      <Harness port={port} verifiedAccess={access(householdB)} />
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("household-storage-report").props.children
      ).toBe(`${householdB}:22`)
    );

    await act(async () => {
      first.resolve({ ok: true, value: usage(householdA, 11) });
      await first.promise;
    });
    expect(screen.getByTestId("household-storage-report").props.children)
      .toBe(`${householdB}:22`);
    expect(getUsage.mock.calls.map(([id]) => id)).toEqual([
      householdA,
      householdB
    ]);
  });

  it("ignores a stale response after the signed-in account changes", async () => {
    const first = deferred<Awaited<ReturnType<HouseholdStorageUsagePort["getUsage"]>>>();
    const getUsage = jest
      .fn<
        ReturnType<HouseholdStorageUsagePort["getUsage"]>,
        Parameters<HouseholdStorageUsagePort["getUsage"]>
      >()
      .mockReturnValueOnce(first.promise)
      .mockImplementationOnce(() => success(usage(householdA, 32)));
    const port: HouseholdStorageUsagePort = { getUsage };
    const screen = await render(
      <Harness
        port={port}
        verifiedAccess={access(householdA, "account-a")}
      />
    );

    await screen.rerender(
      <Harness
        port={port}
        verifiedAccess={access(householdA, "account-b")}
      />
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("household-storage-report").props.children
      ).toBe(`${householdA}:32`)
    );

    await act(async () => {
      first.resolve({ ok: true, value: usage(householdA, 16) });
      await first.promise;
    });
    expect(screen.getByTestId("household-storage-report").props.children)
      .toBe(`${householdA}:32`);

    await screen.rerender(<Harness port={port} verifiedAccess={null} />);
    expect(screen.getByTestId("household-storage-report").props.children)
      .toBe("unknown");
  });

  it("does not expose a port response for a different household", async () => {
    const port: HouseholdStorageUsagePort = {
      getUsage: jest.fn(() => success(usage(householdB, 10)))
    };
    const screen = await render(
      <Harness port={port} verifiedAccess={access(householdA)} />
    );

    await act(async () => undefined);
    expect(screen.getByTestId("household-storage-report").props.children)
      .toBe("unknown");
  });

  it("aborts while paused and refetches after offline recovery", async () => {
    const first = deferred<
      Awaited<ReturnType<HouseholdStorageUsagePort["getUsage"]>>
    >();
    const getUsage = jest
      .fn<
        ReturnType<HouseholdStorageUsagePort["getUsage"]>,
        Parameters<HouseholdStorageUsagePort["getUsage"]>
      >()
      .mockReturnValueOnce(first.promise)
      .mockImplementationOnce(() => success(usage(householdA, 22)));
    const port: HouseholdStorageUsagePort = { getUsage };
    const screen = await render(
      <Harness
        port={port}
        refreshKey="idle:first-attempt:never-synced"
        verifiedAccess={access(householdA)}
      />
    );

    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(1));
    const firstContext = getUsage.mock.calls[0]?.[1];
    expect(firstContext?.signal.aborted).toBe(false);

    await screen.rerender(
      <Harness
        port={port}
        refreshKey="offline:failed:never-synced"
        requestPaused
        verifiedAccess={access(householdA)}
      />
    );
    expect(firstContext?.signal.aborted).toBe(true);
    expect(screen.getByTestId("household-storage-report").props.children)
      .toBe("unknown");

    await screen.rerender(
      <Harness
        port={port}
        refreshKey="idle:recovered:synced"
        verifiedAccess={access(householdA)}
      />
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("household-storage-report").props.children
      ).toBe(`${householdA}:22`)
    );
    expect(getUsage).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve({ ok: true, value: usage(householdA, 11) });
      await first.promise;
    });
    expect(screen.getByTestId("household-storage-report").props.children)
      .toBe(`${householdA}:22`);
  });

  it("uses sync truth as a refresh key even while access is unchanged", async () => {
    const getUsage = jest
      .fn<
        ReturnType<HouseholdStorageUsagePort["getUsage"]>,
        Parameters<HouseholdStorageUsagePort["getUsage"]>
      >()
      .mockImplementationOnce(() => success(usage(householdA, 10)))
      .mockImplementationOnce(() => success(usage(householdA, 20)));
    const port: HouseholdStorageUsagePort = { getUsage };
    const screen = await render(
      <Harness
        port={port}
        refreshKey="idle:first:first"
        verifiedAccess={access(householdA)}
      />
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("household-storage-report").props.children
      ).toBe(`${householdA}:10`)
    );

    await screen.rerender(
      <Harness
        port={port}
        refreshKey="idle:second:second"
        verifiedAccess={access(householdA)}
      />
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("household-storage-report").props.children
      ).toBe(`${householdA}:20`)
    );
    expect(getUsage).toHaveBeenCalledTimes(2);
  });

  it("clears in the background and refreshes on foreground", async () => {
    let onAppStateChange:
      | ((state: AppStateStatus) => void)
      | null = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        onAppStateChange = listener;
        return { remove: jest.fn() };
      });
    const getUsage = jest
      .fn<
        ReturnType<HouseholdStorageUsagePort["getUsage"]>,
        Parameters<HouseholdStorageUsagePort["getUsage"]>
      >()
      .mockImplementationOnce(() => success(usage(householdA, 10)))
      .mockImplementationOnce(() => success(usage(householdA, 30)));
    const port: HouseholdStorageUsagePort = { getUsage };
    const screen = await render(
      <Harness port={port} verifiedAccess={access(householdA)} />
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("household-storage-report").props.children
      ).toBe(`${householdA}:10`)
    );

    await act(async () => onAppStateChange?.("background"));
    expect(screen.getByTestId("household-storage-report").props.children)
      .toBe("unknown");

    await act(async () => onAppStateChange?.("active"));
    await waitFor(() =>
      expect(
        screen.getByTestId("household-storage-report").props.children
      ).toBe(`${householdA}:30`)
    );
    expect(getUsage).toHaveBeenCalledTimes(2);
  });
});
