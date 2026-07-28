import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";

import type {
  LiabilityKind,
  NativeLiability,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";

jest.mock("@/i18n/copy", () => ({
  useCopy: () => ({
    language: "en",
    rtl: false
  })
}));

jest.mock("@/i18n/coreJourneyCopy", () => {
  const actual = jest.requireActual("@/i18n/coreJourneyCopy");
  return {
    ...actual,
    useCoreJourneyCopy: () => ({
      language: "en",
      rtl: false
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

import { LiabilityDetail } from "../app/liability/[id]";

const BASE_LIABILITY: NativeLiability = {
  id: "liability-home",
  householdId: "household-personal",
  version: 1,
  name: "Home finance",
  kind: "mortgage",
  lifecycleStatus: "active",
  archivedAt: null,
  syncStatus: "synced",
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z"
};

function workspaceWith(
  liability: NativeLiability
): NativeWorkspace {
  const workspace = createWorkspace(
    "personal",
    "2026-07-28T08:00:00.000Z"
  );
  return {
    ...workspace,
    household: {
      ...workspace.household,
      id: liability.householdId
    },
    liabilities: [liability]
  };
}

function detail(
  liability: NativeLiability,
  overrides: {
    readonly onUpdate?: (
      name: string,
      kind: LiabilityKind
    ) => Promise<NativeLiability>;
  } = {}
) {
  return (
    <LiabilityDetail
      amountsHidden
      canWrite
      error={null}
      liability={liability}
      onClearError={jest.fn()}
      onDelete={jest.fn(async () => undefined)}
      onMarkPaidOff={jest.fn()}
      onOpenBalance={jest.fn()}
      onSetAmountsHidden={jest.fn()}
      onSetLifecycle={jest.fn(async () => liability)}
      onUpdate={
        overrides.onUpdate ??
        jest.fn(async () => liability)
      }
      saving={false}
      workspace={workspaceWith(liability)}
    />
  );
}

describe("Liability detail draft synchronization", () => {
  it("adopts a newer record revision while the editor remains pristine", async () => {
    const screen = await render(detail(BASE_LIABILITY));
    await fireEvent.press(
      screen.getByTestId("liability-details-edit")
    );

    const remote: NativeLiability = {
      ...BASE_LIABILITY,
      version: 2,
      name: "Updated home finance",
      updatedAt: "2026-07-28T09:00:00.000Z"
    };
    await screen.rerender(detail(remote));

    await waitFor(() => {
      expect(screen.getByTestId("liability-name").props.value).toBe(
        remote.name
      );
    });
    await screen.unmount();
  });

  it("preserves an actively dirty draft across a newer remote revision", async () => {
    const onUpdate = jest.fn(async (
      name: string,
      kind: LiabilityKind
    ) => ({
      ...BASE_LIABILITY,
      version: 3,
      name,
      kind
    }));
    const screen = await render(
      detail(BASE_LIABILITY, { onUpdate })
    );
    await fireEvent.press(
      screen.getByTestId("liability-details-edit")
    );
    await fireEvent.changeText(
      screen.getByTestId("liability-name"),
      "My in-progress edit"
    );

    const remote: NativeLiability = {
      ...BASE_LIABILITY,
      version: 2,
      name: "Remote household edit",
      kind: "personal-loan",
      updatedAt: "2026-07-28T09:00:00.000Z"
    };
    await screen.rerender(detail(remote, { onUpdate }));

    await waitFor(() => {
      expect(
        screen.getByTestId("liability-details-concurrent-update")
      ).toBeTruthy();
    });
    expect(screen.getByTestId("liability-name").props.value).toBe(
      "My in-progress edit"
    );
    expect(
      screen.getByTestId("liability-details-save").props
        .accessibilityState.disabled
    ).toBe(true);
    await fireEvent.press(
      screen.getByTestId("liability-details-save")
    );
    expect(onUpdate).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByTestId("liability-details-confirm-replace")
    );
    expect(
      screen.getByTestId("liability-details-replace-confirmed")
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByTestId("liability-details-save")
    );
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        "My in-progress edit",
        "mortgage"
      );
    });
    await screen.unmount();
  });

  it("reloads newer synchronized details only after the user chooses reload", async () => {
    const screen = await render(detail(BASE_LIABILITY));
    await fireEvent.press(
      screen.getByTestId("liability-details-edit")
    );
    await fireEvent.changeText(
      screen.getByTestId("liability-name"),
      "Draft to discard"
    );
    const remote: NativeLiability = {
      ...BASE_LIABILITY,
      version: 2,
      name: "Remote household edit",
      kind: "personal-loan",
      updatedAt: "2026-07-28T09:00:00.000Z"
    };
    await screen.rerender(detail(remote));
    await waitFor(() => {
      expect(
        screen.getByTestId("liability-details-concurrent-update")
      ).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByTestId("liability-details-reload")
    );
    expect(screen.getByTestId("liability-name").props.value).toBe(
      remote.name
    );
    expect(
      screen.queryByTestId("liability-details-concurrent-update")
    ).toBeNull();
    await screen.unmount();
  });
});
