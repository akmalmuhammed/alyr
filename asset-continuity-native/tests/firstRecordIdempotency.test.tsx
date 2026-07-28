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

describe("durable first-record identity", () => {
  it("reuses an already committed reserved ID instead of duplicating the item or Place before acknowledgement", async () => {
    const initial = createWorkspace("sample");
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: initial,
      operations: []
    });
    const commit = jest.spyOn(repository, "commit");
    const wrapper = ({ children }: PropsWithChildren) => (
      <WorkspaceProvider repositoryOverride={repository}>
        {children}
      </WorkspaceProvider>
    );
    const hook = await renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => {
      expect(hook.result.current.storageReady).toBe(true);
    });

    let firstAssetId = "";
    let retriedAssetId = "";
    let firstPlaceId = "";
    let retriedPlaceId = "";
    await act(async () => {
      const assetInput = {
        recordId: "reserved-first-asset",
        name: "Childhood watch",
        categoryId: "home.other",
        categoryLabel: "Personal item",
        photo: null,
        locationStatus: "unknown" as const,
        placeId: null,
        roomId: null,
        locatorText: null,
        evidence: null
      };
      firstAssetId = (
        await hook.result.current.createAsset(assetInput)
      ).id;
      // Simulates process death after commit and a retry before SecureStore ack.
      retriedAssetId = (
        await hook.result.current.createAsset(assetInput)
      ).id;

      const placeInput = {
        recordId: "reserved-first-place",
        name: "West Bay home",
        addressSummary: "West Bay",
        regionLabel: "Doha",
        roomName: null,
        pin: null
      };
      firstPlaceId = (
        await hook.result.current.createPlace(placeInput)
      ).id;
      retriedPlaceId = (
        await hook.result.current.createPlace(placeInput)
      ).id;
    });

    expect(firstAssetId).toBe("reserved-first-asset");
    expect(retriedAssetId).toBe(firstAssetId);
    expect(firstPlaceId).toBe("reserved-first-place");
    expect(retriedPlaceId).toBe(firstPlaceId);
    expect(
      hook.result.current.workspace?.assets.filter(
        (asset) => asset.id === firstAssetId
      )
    ).toHaveLength(1);
    expect(
      hook.result.current.workspace?.places.filter(
        (place) => place.id === firstPlaceId
      )
    ).toHaveLength(1);
    expect(commit).toHaveBeenCalledTimes(2);

    const loaded = await repository.load();
    expect(loaded.revision).toBe(3);
    const durable = loaded.snapshot as NativeWorkspace;
    expect(
      durable.assets.filter((asset) => asset.id === firstAssetId)
    ).toHaveLength(1);
    expect(
      durable.places.filter((place) => place.id === firstPlaceId)
    ).toHaveLength(1);
    await hook.unmount();
  });
});
