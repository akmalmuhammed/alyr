jest.mock("expo-crypto", () => {
  let id = 0;
  function digest64(value: string): string {
    let state = 2_166_136_261;
    let result = "";
    for (let round = 0; round < 8; round += 1) {
      for (let index = 0; index < value.length; index += 1) {
        state ^= value.charCodeAt(index) + round;
        state = Math.imul(state, 16_777_619);
      }
      result += (state >>> 0).toString(16).padStart(8, "0");
      state ^= 0x9e3779b9 + round;
    }
    return result;
  }
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { HEX: "hex" },
    digestStringAsync: jest.fn(
      async (_algorithm: string, value: string) => digest64(value)
    ),
    randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`),
    getRandomBytes: jest.fn((length: number) => new Uint8Array(length).fill(7))
  };
});

import { act, render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import type { AuthSessionDescriptor } from "@/auth/types";
import { MemoryPreviewAttachmentStore } from "@/data/attachmentStore";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type { VaultScope } from "@/data/vaultScope";
import { createWorkspace } from "@/domain/sample";
import {
  releaseWorkspaceVaultAccess,
  workspaceVaultAccessForSession
} from "@/state/SessionBoundWorkspaceProvider";
import {
  WorkspaceProvider,
  useWorkspace,
  vaultScopeForWorkspaceAccess,
  type WorkspaceVaultAccess,
  type WorkspaceVaultResourceFactory
} from "@/state/WorkspaceProvider";

const verifiedSession: AuthSessionDescriptor = {
  identity: {
    id: "account-a",
    email: "owner@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: null,
  onboarding: "complete",
  activeHouseholdId: "household-a",
  activeMembershipId: "membership-a",
  activeHouseholdRole: "owner"
};

class TrackingRepository extends MemoryWorkspaceRepository {
  lockCalls = 0;

  override async lock(): Promise<void> {
    this.lockCalls += 1;
    await super.lock();
  }
}

class TrackingAttachmentStore extends MemoryPreviewAttachmentStore {
  lockCalls = 0;

  override async lock(): Promise<void> {
    this.lockCalls += 1;
    await super.lock();
  }
}

let latestWorkspace: ReturnType<typeof useWorkspace> | null = null;

function Probe() {
  latestWorkspace = useWorkspace();
  return (
    <Text testID="workspace-state">
      {latestWorkspace.loading ? "loading" : "ready"}:
      {latestWorkspace.storageReady ? "open" : "locked"}:
      {latestWorkspace.workspace?.household.id ?? "none"}
    </Text>
  );
}

describe("account and household vault boundary", () => {
  beforeEach(() => {
    latestWorkspace = null;
  });

  it("requires a verified signed session with an explicit household", () => {
    expect(workspaceVaultAccessForSession("preview", null)).toEqual({
      kind: "preview"
    });
    expect(
      workspaceVaultAccessForSession("supabase", {
        ...verifiedSession,
        activeHouseholdId: null,
        activeMembershipId: null,
        activeHouseholdRole: null
      })
    ).toBeNull();
    expect(
      workspaceVaultAccessForSession("supabase", verifiedSession)
    ).toEqual({
      kind: "authenticated",
      accountId: "account-a",
      householdId: "household-a",
      role: "owner"
    });
    expect(
      workspaceVaultAccessForSession("unavailable", verifiedSession)
    ).toBeNull();
  });

  it("does not release an authenticated workspace before device verification", () => {
    const access: WorkspaceVaultAccess = {
      kind: "authenticated",
      accountId: "account-a",
      householdId: "household-a",
      role: "owner"
    };
    expect(releaseWorkspaceVaultAccess(access, false)).toBeNull();
    expect(releaseWorkspaceVaultAccess(access, true)).toBe(access);
    expect(
      releaseWorkspaceVaultAccess({ kind: "preview" }, false)
    ).toEqual({ kind: "preview" });
  });

  it("keeps a viewer read-only at the local durability boundary", async () => {
    const access: WorkspaceVaultAccess = {
      kind: "authenticated",
      accountId: "account-viewer",
      householdId: "household-viewer",
      role: "viewer"
    };
    const scope = await vaultScopeForWorkspaceAccess(access);
    const repository = new TrackingRepository(scope);
    const attachmentStore = new TrackingAttachmentStore(scope);
    await repository.initialize();
    const seeded = createWorkspace(
      "personal",
      "2026-07-27T00:00:00.000Z",
      {
        householdId: "household-viewer",
        ownerMemberId: "member-owner",
        deviceId: "device-viewer"
      }
    );
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: seeded,
      operations: []
    });

    const screen = await render(
      <WorkspaceProvider
        attachmentStoreOverride={attachmentStore}
        repositoryOverride={repository}
        vaultAccess={access}
      >
        <Probe />
      </WorkspaceProvider>
    );
    await waitFor(() => {
      expect(latestWorkspace?.workspace?.household.id).toBe(
        "household-viewer"
      );
      expect(latestWorkspace?.permissionRole).toBe("viewer");
      expect(latestWorkspace?.can("asset.read")).toBe(true);
      expect(latestWorkspace?.can("place.write")).toBe(false);
    });

    let rejection: unknown;
    await act(async () => {
      try {
        await latestWorkspace!.createPlace({
          name: "False local save",
          addressSummary: null,
          regionLabel: "Doha",
          roomName: null,
          pin: null
        });
      } catch (caught) {
        rejection = caught;
      }
    });
    expect(rejection).toMatchObject({
      code: "AUTHORIZATION_DENIED",
      capability: "place.write"
    });

    const after = await repository.load();
    expect(after.revision).toBe(1);
    expect(after.snapshot?.places).toHaveLength(0);
    expect(await repository.listPendingOperations(1000)).toHaveLength(0);
    expect(latestWorkspace?.workspace?.places).toHaveLength(0);
    await waitFor(() => {
      expect(latestWorkspace?.error).toContain("Nothing was saved");
    });
    await screen.unmount();
  });

  it("locks the old database and attachment scope before opening another household", async () => {
    const repositories: TrackingRepository[] = [];
    const attachmentStores: TrackingAttachmentStore[] = [];
    const factory: WorkspaceVaultResourceFactory = {
      async createRepository(scope: VaultScope) {
        const repository = new TrackingRepository(scope);
        repositories.push(repository);
        return repository;
      },
      createAttachmentStore(scope: VaultScope) {
        const store = new TrackingAttachmentStore(scope);
        attachmentStores.push(store);
        return store;
      }
    };
    const accessA: WorkspaceVaultAccess = {
      kind: "authenticated",
      accountId: "account-a",
      householdId: "household-a",
      role: "owner"
    };
    const accessB: WorkspaceVaultAccess = {
      kind: "authenticated",
      accountId: "account-a",
      householdId: "household-b",
      role: "owner"
    };
    const screen = await render(
      <WorkspaceProvider
        resourceFactory={factory}
        vaultAccess={accessA}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect({
        storageReady: latestWorkspace?.storageReady,
        error: latestWorkspace?.error
      }).toEqual({
        storageReady: true,
        error: null
      });
    });
    expect(latestWorkspace?.attachmentStore).toBe(attachmentStores[0]);
    await act(async () => {
      await latestWorkspace!.startWorkspace("personal");
    });
    expect(latestWorkspace?.workspace?.household.id).toBe("household-a");

    await screen.rerender(
      <WorkspaceProvider
        resourceFactory={factory}
        vaultAccess={accessB}
      >
        <Probe />
      </WorkspaceProvider>
    );
    await waitFor(() => {
      expect(repositories).toHaveLength(2);
      expect(latestWorkspace?.storageReady).toBe(true);
      expect(latestWorkspace?.workspace).toBeNull();
    });
    expect(latestWorkspace?.attachmentStore).toBe(attachmentStores[1]);
    expect(latestWorkspace?.attachmentStore).not.toBe(attachmentStores[0]);

    expect(repositories[0]?.lockCalls).toBeGreaterThanOrEqual(1);
    expect(attachmentStores[0]?.lockCalls).toBeGreaterThanOrEqual(1);
    expect(repositories[0]?.scopeId).not.toBe(repositories[1]?.scopeId);
    expect(attachmentStores[0]?.scopeId).not.toBe(
      attachmentStores[1]?.scopeId
    );

    await act(async () => {
      await latestWorkspace!.startWorkspace("personal");
    });
    expect(latestWorkspace?.workspace?.household.id).toBe("household-b");
    await screen.unmount();
  });

  it("publishes null while a new household scope is opening", async () => {
    const repositories: TrackingRepository[] = [];
    const attachmentStores: TrackingAttachmentStore[] = [];
    let repositoryRequestCount = 0;
    let releaseSecondRepository!: () => void;
    const secondRepositoryGate = new Promise<void>((resolve) => {
      releaseSecondRepository = resolve;
    });
    const factory: WorkspaceVaultResourceFactory = {
      async createRepository(scope) {
        repositoryRequestCount += 1;
        if (repositoryRequestCount === 2) {
          await secondRepositoryGate;
        }
        const repository = new TrackingRepository(scope);
        repositories.push(repository);
        return repository;
      },
      createAttachmentStore(scope) {
        const store = new TrackingAttachmentStore(scope);
        attachmentStores.push(store);
        return store;
      }
    };
    const screen = await render(
      <WorkspaceProvider
        resourceFactory={factory}
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-a",
          householdId: "household-a",
          role: "owner"
        }}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latestWorkspace?.storageReady).toBe(true);
      expect(latestWorkspace?.attachmentStore).toBe(attachmentStores[0]);
    });

    await screen.rerender(
      <WorkspaceProvider
        resourceFactory={factory}
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-a",
          householdId: "household-b",
          role: "owner"
        }}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(repositoryRequestCount).toBe(2);
      expect(latestWorkspace?.storageReady).toBe(false);
      expect(latestWorkspace?.attachmentStore).toBeNull();
    });
    expect(attachmentStores[0]?.lockCalls).toBeGreaterThanOrEqual(1);

    await act(async () => {
      releaseSecondRepository();
      await secondRepositoryGate;
    });
    await waitFor(() => {
      expect(repositories).toHaveLength(2);
      expect(attachmentStores).toHaveLength(2);
      expect(latestWorkspace?.storageReady).toBe(true);
      expect(latestWorkspace?.attachmentStore).toBe(attachmentStores[1]);
    });

    screen.unmount();
  });

  it("rejects a snapshot whose embedded household does not match the selected scope", async () => {
    const repositories: TrackingRepository[] = [];
    const attachmentStores: TrackingAttachmentStore[] = [];
    const factory: WorkspaceVaultResourceFactory = {
      async createRepository(scope) {
        const repository = new TrackingRepository(scope);
        repositories.push(repository);
        await repository.initialize();
        const mismatched = createWorkspace(
          "personal",
          "2026-07-27T00:00:00.000Z",
          {
            householdId: "household-other",
            ownerMemberId: "owner-other",
            deviceId: "device-other"
          }
        );
        await repository.commit({
          expectedRevision: 0,
          nextRevision: 1,
          snapshot: mismatched,
          operations: []
        });
        return repository;
      },
      createAttachmentStore(scope) {
        const attachmentStore = new TrackingAttachmentStore(scope);
        attachmentStores.push(attachmentStore);
        return attachmentStore;
      }
    };
    const screen = await render(
      <WorkspaceProvider
        resourceFactory={factory}
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-a",
          householdId: "household-a",
          role: "owner"
        }}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latestWorkspace?.loading).toBe(false);
      expect(latestWorkspace?.storageReady).toBe(false);
      expect(latestWorkspace?.attachmentStore).toBeNull();
      expect(latestWorkspace?.workspace).toBeNull();
      expect(latestWorkspace?.error).toContain("selected household");
    });
    expect(repositories[0]?.lockCalls).toBeGreaterThanOrEqual(1);
    expect(attachmentStores[0]?.lockCalls).toBeGreaterThanOrEqual(1);
    await screen.unmount();
  });
});
