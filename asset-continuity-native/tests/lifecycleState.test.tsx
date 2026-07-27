import {
  act,
  renderHook,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type { NativeWorkspace } from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import {
  useWorkspace,
  WorkspaceProvider
} from "@/state/WorkspaceProvider";

jest.mock("expo-crypto", () => {
  let sequence = 0;
  return {
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    getRandomBytes: (length: number) => new Uint8Array(length)
  };
});

async function seededRepository(workspace: NativeWorkspace) {
  const repository = new MemoryWorkspaceRepository();
  await repository.initialize();
  const result = await repository.commit({
    expectedRevision: 0,
    nextRevision: 1,
    snapshot: workspace,
    operations: []
  });
  expect(result.ok).toBe(true);
  return repository;
}

describe("WorkspaceProvider lifecycle state", () => {
  it("commits archive, evidence review and restore with durable outbox commands", async () => {
    const sample = createWorkspace("sample");
    const workspace: NativeWorkspace = {
      ...sample,
      mode: "personal"
    };
    const target = workspace.assets[0]!;
    const pendingEvidence = workspace.evidence.find(
      (item) => item.reviewStatus === "pending"
    )!;
    const repository = await seededRepository(workspace);
    const wrapper = ({ children }: PropsWithChildren) => (
      <WorkspaceProvider repositoryOverride={repository}>
        {children}
      </WorkspaceProvider>
    );
    const hook = await renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => {
      expect(hook.result.current?.loading).toBe(false);
      expect(hook.result.current?.workspace).not.toBeNull();
    });

    await act(async () => {
      await hook.result.current!.setAssetLifecycle({
        assetId: target.id,
        lifecycleStatus: "archived"
      });
      await hook.result.current!.setEvidenceReviewStatus({
        evidenceId: pendingEvidence.id,
        reviewStatus: "reviewed"
      });
      await hook.result.current!.setAssetLifecycle({
        assetId: target.id,
        lifecycleStatus: "active"
      });
    });

    const loaded = await repository.load();
    expect(loaded.revision).toBe(4);
    const saved = loaded.snapshot as NativeWorkspace;
    expect(
      saved.assets.find((item) => item.id === target.id)
    ).toMatchObject({
      lifecycleStatus: "active",
      archivedAt: null,
      version: 3
    });
    expect(
      saved.evidence.find((item) => item.id === pendingEvidence.id)
    ).toMatchObject({
      reviewStatus: "reviewed",
      version: 2
    });
    expect(
      (await repository.listPendingOperations(10)).map(
        (operation) => operation.command.type
      )
    ).toEqual([
      "asset.archive",
      "evidence.review",
      "asset.restore"
    ]);
    expect(hook.result.current?.pendingOperationCount).toBe(3);

    await hook.unmount();
  });
});
