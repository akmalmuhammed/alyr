// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { App } from "../src/App.jsx";
import { assertSessionWorkspaceOwnership } from "../src/SecureAccountPanel.jsx";
import {
  STORAGE_KEY,
  createSampleWorkspace,
  selectWorkspaceActorMemberId,
  workspaceReducer,
} from "../src/domain.js";
import {
  createAccountStorageScopeId,
  storageKeysForScope,
} from "../src/storageScope.js";
import { readRecoveryGenerationState } from "../src/restoreGeneration.js";

const accountHarness = vi.hoisted(() => ({
  currentSession: null,
  registerSession: null,
  loginSession: null,
}));
const recoveryHarness = vi.hoisted(() => ({
  states: new Map(),
  receipts: new Map(),
}));

vi.mock("../src/restoreGeneration.js", () => {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const save = async ({
    scopeId,
    workspace,
    expectedRevision,
    now = "2026-07-25T05:00:00.000Z",
  }) => {
    const current = recoveryHarness.states.get(scopeId) || null;
    if (
      expectedRevision !== undefined &&
      Number(expectedRevision) !== Number(current?.revision || 0)
    ) {
      const error = new Error("The active workspace changed in another tab.");
      error.code = "RECOVERY_HEAD_STALE";
      throw error;
    }
    const state = {
      revision: Number(current?.revision || 0) + 1,
      activeGenerationId: current?.activeGenerationId || null,
      workspace: clone(workspace),
      rollback: current?.rollback || null,
      updatedAt: now,
    };
    recoveryHarness.states.set(scopeId, state);
    return clone(state);
  };
  return {
    persistActiveRecoveryWorkspace: vi.fn(save),
    persistActiveRecoveryWorkspaceWithFiles: vi.fn(
      async ({
        scopeId,
        operationId,
        workspace,
        expectedRevision,
        now,
      }) => {
        const receiptKey = `${scopeId}:${operationId}`;
        const prior = recoveryHarness.receipts.get(receiptKey);
        if (prior) return clone({ ...prior, idempotent: true });
        const state = await save({
          scopeId,
          workspace,
          expectedRevision,
          now,
        });
        const receipt = {
          ...state,
          scopeId,
          operationId,
          records: [],
          idempotent: false,
        };
        recoveryHarness.receipts.set(receiptKey, receipt);
        return clone(receipt);
      },
    ),
    readRecoveryGenerationState: vi.fn(async (scopeId) => {
      const state = recoveryHarness.states.get(scopeId);
      return state ? clone(state) : null;
    }),
    readRecoveryRollback: vi.fn(() => null),
    resetRecoveryGenerationScope: vi.fn(async ({ scopeId }) => {
      recoveryHarness.states.delete(scopeId);
      for (const key of recoveryHarness.receipts.keys()) {
        if (key.startsWith(`${scopeId}:`)) {
          recoveryHarness.receipts.delete(key);
        }
      }
      return { removed: true };
    }),
    rollbackRecoveryGeneration: vi.fn(async () => {
      throw new Error("No recovery rollback is available.");
    }),
    stageAndActivateRecoveryGeneration: vi.fn(
      async ({ scopeId, workspace, now }) =>
        save({ scopeId, workspace, now }),
    ),
  };
});

vi.mock("../src/continuityApi.js", () => {
  class ContinuityApiError extends Error {
    constructor(message, code = "API_ERROR", status = 0) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    ContinuityApiError,
    continuityApi: {
      getSession: vi.fn(async () => accountHarness.currentSession),
      register: vi.fn(async () => {
        accountHarness.currentSession = accountHarness.registerSession;
        return accountHarness.currentSession;
      }),
      login: vi.fn(async () => {
        accountHarness.currentSession = accountHarness.loginSession;
        return accountHarness.currentSession;
      }),
      logout: vi.fn(async () => {
        accountHarness.currentSession = null;
        return { ok: true };
      }),
      getMembers: vi.fn(async () => []),
      grantAccess: vi.fn(async () => ({ message: "Access updated." })),
      putLatestBackup: vi.fn(async () => ({ backup: null })),
      getLatestBackup: vi.fn(async () => {
        throw new ContinuityApiError("No backup exists.", "NOT_FOUND", 404);
      }),
    },
  };
});

vi.mock("../src/Globe.jsx", () => ({
  ContinuityGlobe: () => (
    <div data-testid="continuity-globe">Interactive globe</div>
  ),
}));

vi.mock("../src/RoomCapturePanel.jsx", () => ({
  RoomCapturePanel: ({ createdBy }) => (
    <div data-testid="room-capture-actor">{createdBy}</div>
  ),
}));

const NOW = "2026-07-25T05:00:00.000Z";

function session(
  accountId,
  householdId,
  householdName,
  role = "owner",
) {
  return {
    accountId,
    householdId,
    householdName,
    displayName: `${householdName} owner`,
    email: `${accountId}@example.test`,
    role,
    csrfToken: `csrf-${accountId}`,
    expiresAt: "2026-08-25T05:00:00.000Z",
  };
}

function workspaceWithAsset({
  householdId,
  householdName,
  accountId,
  assetId,
  assetName,
}) {
  let workspace = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    household: { id: householdId, name: householdName },
    member: {
      id: accountId,
      name: `${householdName} owner`,
      email: `${accountId}@example.test`,
    },
    now: NOW,
  });
  workspace = workspaceReducer(workspace, {
    type: "ADD_ASSET",
    asset: {
      id: assetId,
      name: assetName,
      category: "Personal",
      categoryId: "custom.other",
      categoryPath: ["custom", "custom.other"],
      kind: "physical",
      locationMode: "unknown",
      locationStatus: "unknown",
      lifecycleStatus: "active",
      visibility: "private",
      createdAt: NOW,
    },
    now: NOW,
  });
  return workspace;
}

function accountWorkspaceKey(accountSession) {
  return storageKeysForScope(
    createAccountStorageScopeId(accountSession),
  ).workspace;
}

function sampleWorkspaceWithPendingNote() {
  return workspaceReducer(
    {
      ...createSampleWorkspace(),
      mode: "personal",
      household: {
        ...createSampleWorkspace().household,
        demoOnly: false,
      },
    },
    {
      type: "ADD_EVIDENCE",
      evidence: {
        id: "evidence-actor-note",
        assetId: "gmt-master-ii",
        type: "Actor note",
        kind: "note",
        relation: "supports",
        note: "Reviewed by the active signed-in workspace member.",
      },
      now: NOW,
    },
  );
}

describe("authenticated browser workspace boundaries", () => {
  beforeEach(() => {
    accountHarness.currentSession = null;
    accountHarness.registerSession = null;
    accountHarness.loginSession = null;
    recoveryHarness.states.clear();
    recoveryHarness.receipts.clear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/welcome");
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("rejects backup or restore material from another household", () => {
    const accountA = session("account-a", "household-a", "Archive A");
    const workspaceB = workspaceWithAsset({
      householdId: "household-b",
      householdName: "Archive B",
      accountId: "account-b",
      assetId: "asset-account-b",
      assetName: "Account B camera",
    });

    expect(() =>
      assertSessionWorkspaceOwnership(
        workspaceB,
        accountA,
        "backed up",
      ),
    ).toThrow(/different household.*not backed up/i);
    expect(() =>
      assertSessionWorkspaceOwnership(
        workspaceB,
        accountA,
        "restored",
      ),
    ).toThrow(/different household.*not restored/i);
  });

  it("requires an explicit verified move before local records become account records", async () => {
    const user = userEvent.setup();
    const accountA = session("account-a", "household-a", "Archive A");
    accountHarness.registerSession = accountA;
    const localWorkspace = workspaceWithAsset({
      householdId: "local-household",
      householdName: "Local household",
      accountId: "local-owner",
      assetId: "asset-local-heirloom",
      assetName: "Local heirloom",
    });
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(localWorkspace),
    );
    window.history.replaceState({}, "", "/vault");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Recover beyond this browser",
      }),
    ).toBeTruthy();
    await user.type(screen.getByLabelText("Your name"), "Archive owner");
    await user.type(screen.getByLabelText("Email"), "owner@example.test");
    await user.type(
      screen.getByLabelText("Account password"),
      "correct horse battery staple",
    );
    await user.click(
      screen.getByRole("button", { name: "Create secure account" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Move them into Archive A?",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/1 assets, 0 places/i)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Move into my account" }),
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe("/home");
    });
    const accountSnapshot = JSON.parse(
      window.localStorage.getItem(accountWorkspaceKey(accountA)),
    );
    expect(accountSnapshot.household.id).toBe(accountA.householdId);
    expect(accountSnapshot.household.ownerMemberId).toBe(accountA.accountId);
    expect(
      selectWorkspaceActorMemberId(accountSnapshot, accountA),
    ).toBe(accountA.accountId);
    expect(
      accountSnapshot.assets.some(
        (asset) => asset.id === "asset-local-heirloom",
      ),
    ).toBe(true);

    await user.click(
      (await screen.findAllByRole("link", { name: "Vault" }))[0],
    );
    await user.click(
      await screen.findByRole("button", { name: "Sign out" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Start with what matters." }),
    ).toBeTruthy();
    await waitFor(() => {
      const localSnapshot = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY),
      );
      expect(
        localSnapshot.assets.some(
          (asset) => asset.id === "asset-local-heirloom",
        ),
      ).toBe(false);
    });
  });

  it("locks the prior account and opens only the next signed-in account scope", async () => {
    const user = userEvent.setup();
    const accountA = session("account-a", "household-a", "Archive A");
    const accountB = session("account-b", "household-b", "Archive B");
    const workspaceA = workspaceWithAsset({
      householdId: accountA.householdId,
      householdName: accountA.householdName,
      accountId: accountA.accountId,
      assetId: "asset-account-a",
      assetName: "Account A watch",
    });
    const workspaceB = workspaceWithAsset({
      householdId: accountB.householdId,
      householdName: accountB.householdName,
      accountId: accountB.accountId,
      assetId: "asset-account-b",
      assetName: "Account B camera",
    });
    window.localStorage.setItem(
      accountWorkspaceKey(accountA),
      JSON.stringify(workspaceA),
    );
    window.localStorage.setItem(
      accountWorkspaceKey(accountB),
      JSON.stringify(workspaceB),
    );
    accountHarness.currentSession = accountA;
    accountHarness.loginSession = accountB;
    window.history.replaceState({}, "", "/assets");

    render(<App />);

    expect((await screen.findAllByText("Account A watch")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Account B camera")).toHaveLength(0);

    await user.click(screen.getAllByRole("link", { name: "Vault" })[0]);
    await user.click(
      await screen.findByRole("button", { name: "Sign out" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Start with what matters." }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "Sign in or recover an existing household",
      }),
    );
    await user.click(screen.getByRole("tab", { name: "Sign in" }));
    await user.type(screen.getByLabelText("Email"), accountB.email);
    await user.type(
      screen.getByLabelText("Account password"),
      "correct horse battery staple",
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/home");
    });
    await user.click(
      (await screen.findAllByRole("link", { name: "Assets" }))[0],
    );
    expect((await screen.findAllByText("Account B camera")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Account A watch")).toHaveLength(0);

    window.history.pushState({}, "", "/assets/asset-account-a");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(
      await screen.findByRole("heading", { name: "Asset not found" }),
    ).toBeTruthy();
  });

  it.each([
    ["owner", "member-akmal"],
    ["non-owner", "member-sara"],
  ])(
    "attributes evidence review to the signed-in %s member",
    async (_role, accountId) => {
      const user = userEvent.setup();
      const activeSession = session(
        accountId,
        "household-al-hamad-demo",
        "Al Hamad household",
      );
      accountHarness.currentSession = activeSession;
      window.localStorage.setItem(
        accountWorkspaceKey(activeSession),
        JSON.stringify(sampleWorkspaceWithPendingNote()),
      );
      window.history.replaceState(
        {},
        "",
        "/evidence/evidence-actor-note",
      );

      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Actor note" }),
      ).toBeTruthy();
      await user.click(
        screen.getByRole("button", { name: "Mark reviewed" }),
      );

      await waitFor(() => {
        const saved = JSON.parse(
          window.localStorage.getItem(
            accountWorkspaceKey(activeSession),
          ),
        );
        const evidence = saved.evidence.find(
          (item) => item.id === "evidence-actor-note",
        );
        expect(evidence.status).toBe("verified");
        expect(evidence.verifiedByMemberId).toBe(accountId);
      });
    },
  );

  it.each([
    ["owner", "member-akmal", "owner"],
    ["co-owner", "member-sara", "co-owner"],
  ])(
    "attributes standard-capture asset location corrections to the signed-in %s",
    async (_label, accountId, role) => {
      const user = userEvent.setup();
      const activeSession = session(
        accountId,
        "household-al-hamad-demo",
        "Al Hamad household",
        role,
      );
      accountHarness.currentSession = activeSession;
      window.localStorage.setItem(
        accountWorkspaceKey(activeSession),
        JSON.stringify(sampleWorkspaceWithPendingNote()),
      );
      window.history.replaceState(
        {},
        "",
        "/assets/gmt-master-ii?capture=asset&assetId=gmt-master-ii&stage=location",
      );

      render(<App />);

      const dialog = await screen.findByRole("dialog", {
        name: "Where is it?",
      });
      await user.click(
        within(dialog).getByRole("button", {
          name: "Needs detail",
        }),
      );
      const detail = within(dialog).getByLabelText(
        /Location detail/i,
      );
      await user.clear(detail);
      await user.type(
        detail,
        `${role} corrected location`,
      );
      await user.click(
        within(dialog).getByRole("button", {
          name: "Review location",
        }),
      );
      await user.click(
        within(dialog).getByRole("button", {
          name: "Save record",
        }),
      );

      await waitFor(async () => {
        const saved = (
          await readRecoveryGenerationState(
            createAccountStorageScopeId(activeSession),
          )
        ).workspace;
        const activeAssignment = saved.locationAssignments.find(
          (assignment) =>
            assignment.assetId === "gmt-master-ii" &&
            !assignment.validTo,
        );
        expect(activeAssignment.createdByMemberId).toBe(accountId);
        expect(activeAssignment.reason).toBe(
          "Location corrected in standard capture",
        );
      });
    },
  );

  it.each([
    ["owner", "member-akmal"],
    ["non-owner", "member-sara"],
  ])(
    "passes the signed-in %s member into room capture",
    async (_role, accountId) => {
      const activeSession = session(
        accountId,
        "household-al-hamad-demo",
        "Al Hamad household",
      );
      accountHarness.currentSession = activeSession;
      window.localStorage.setItem(
        accountWorkspaceKey(activeSession),
        JSON.stringify(sampleWorkspaceWithPendingNote()),
      );
      window.history.replaceState(
        {},
        "",
        "/assets?capture=studio&tool=room&placeId=west-bay-home&spaceId=study",
      );

      render(<App />);

      expect(
        await screen.findByTestId(
          "room-capture-actor",
          {},
          { timeout: 10_000 },
        ),
      ).toHaveProperty("textContent", accountId);
    },
  );

  it("blocks evidence review and room capture for a signed-in account outside the workspace", async () => {
    const outsider = session(
      "member-outsider",
      "household-al-hamad-demo",
      "Al Hamad household",
    );
    accountHarness.currentSession = outsider;
    window.localStorage.setItem(
      accountWorkspaceKey(outsider),
      JSON.stringify(sampleWorkspaceWithPendingNote()),
    );
    window.history.replaceState(
      {},
      "",
      "/evidence/evidence-actor-note",
    );

    const { unmount } = render(<App />);

    expect(
      await screen.findByText("Active workspace membership required"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Mark reviewed" }),
    ).toBeNull();
    unmount();

    window.history.replaceState(
      {},
      "",
      "/assets?capture=studio&tool=room&placeId=west-bay-home&spaceId=study",
    );
    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Active workspace membership required",
      }, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(screen.queryByTestId("room-capture-actor")).toBeNull();
  });
});
