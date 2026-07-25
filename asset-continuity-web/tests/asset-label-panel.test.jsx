// @vitest-environment jsdom

import React from "react";
import axe from "axe-core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetLabelPanel } from "../src/AssetLabelPanel.jsx";
import { resolveActiveLabelAssignmentForMove } from "../src/CaptureStudioDrawer.jsx";
import {
  assignAssetLabel,
  createLabelRegistry,
  encodeAssetLabel,
  resolveAssetLabel,
  transferAssetLabel,
  unassignAssetLabel,
} from "../src/capturePipeline.js";

const LABEL_ID = "lbl_0123456789abcdef";
const LABEL_PAYLOAD = encodeAssetLabel(LABEL_ID);

function fixtureWorkspace(overrides = {}) {
  const createdAt = "2026-07-25T08:00:00.000Z";
  let labelRegistry = createLabelRegistry({
    householdId: "household-one",
    createdAt,
  });
  labelRegistry = assignAssetLabel(labelRegistry, {
    assignmentId: "asg_0123456789abcdef",
    labelId: LABEL_ID,
    assetId: "watch-one",
    assignedBy: "member-one",
    assignedAt: createdAt,
    source: "qr",
  });
  return {
    household: {
      id: "household-one",
      ownerMemberId: "member-one",
    },
    deviceId: "browser-test",
    assetLabelRegistry: labelRegistry,
    assets: [
      {
        id: "watch-one",
        name: "Travel watch",
        kind: "physical",
        lifecycleStatus: "active",
        locationMode: "physical",
        locationStatus: "known",
        placeId: "home-one",
        spaceId: "drawer-one",
        locationDetail: "Watch roll",
      },
      {
        id: "camera-one",
        name: "Film camera",
        kind: "physical",
        lifecycleStatus: "active",
        locationMode: "physical",
        locationStatus: "unknown",
        placeId: null,
        spaceId: null,
      },
    ],
    places: [
      { id: "home-one", name: "West Bay Home", status: "active" },
      { id: "studio-one", name: "Archive Studio", status: "active" },
    ],
    spaces: [
      {
        id: "drawer-one",
        placeId: "home-one",
        parentSpaceId: null,
        name: "Watch drawer",
      },
      {
        id: "archive-room",
        placeId: "studio-one",
        parentSpaceId: null,
        name: "Archive room",
      },
      {
        id: "cabinet-one",
        placeId: "studio-one",
        parentSpaceId: "archive-room",
        name: "Climate cabinet",
      },
    ],
    locationAssignments: [
      {
        id: "location-watch-one",
        assetId: "watch-one",
        mode: "physical",
        placeId: "home-one",
        spaceId: "drawer-one",
        locatorText: "Watch roll",
        validFrom: createdAt,
        validTo: null,
      },
    ],
    ...overrides,
  };
}

function renderPanel(workspace = fixtureWorkspace(), props = {}) {
  return render(
    <AssetLabelPanel
      workspace={workspace}
      assets={workspace.assets}
      places={workspace.places}
      spaces={workspace.spaces}
      {...props}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.BarcodeDetector;
  delete window.NDEFReader;
  delete globalThis.createImageBitmap;
});

describe("AssetLabelPanel", () => {
  it("creates a real SVG QR from an opaque payload without embedding asset data", async () => {
    const user = userEvent.setup();
    const workspace = fixtureWorkspace();
    renderPanel(workspace);

    await user.selectOptions(screen.getByLabelText("Asset"), "camera-one");
    await user.click(
      screen.getByRole("button", { name: "Create private QR" }),
    );

    const qr = await screen.findByRole("img", {
      name: /Scannable QR label assigned to Film camera/i,
    });
    const labelId = screen.getByTestId("label-id").textContent;
    const payload = screen.getByTestId("label-payload").value;

    expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(labelId).toMatch(/^lbl_[a-f0-9]{36}$/);
    expect(payload).toMatch(/^alyr:asset-label:v1:/);
    expect(payload).not.toContain("camera-one");
    expect(payload).not.toContain("Film camera");
    expect(
      screen.getByText(/Connect label saving before printing/i),
    ).toBeTruthy();
  });

  it("deactivates a persisted label so printed copies no longer resolve", async () => {
    const user = userEvent.setup();
    const onLabelRegistryChange = vi.fn();
    renderPanel(fixtureWorkspace(), { onLabelRegistryChange });

    expect(screen.getByText("Active private label")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Deactivate" }),
    );

    await waitFor(() =>
      expect(onLabelRegistryChange).toHaveBeenCalledTimes(1),
    );
    const registry = onLabelRegistryChange.mock.calls[0][0];
    expect(resolveAssetLabel(registry, LABEL_ID)).toBeNull();
    expect(
      screen.getByText(/Existing printed codes no longer resolve/i),
    ).toBeTruthy();
  });

  it("clears a resolved label when deactivated and blocks stale move submission", async () => {
    const user = userEvent.setup();
    const onLabelRegistryChange = vi.fn();
    const onMove = vi.fn();
    renderPanel(fixtureWorkspace(), { onLabelRegistryChange, onMove });

    await user.type(
      screen.getByLabelText("Manual opaque payload"),
      LABEL_PAYLOAD,
    );
    await user.click(
      screen.getByRole("button", { name: "Resolve pasted label" }),
    );
    expect(
      await screen.findByText(/Label resolved to Travel watch/i),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Destination Place"),
      "studio-one",
    );

    const moveForm = screen
      .getByRole("button", { name: "Review and move" })
      .closest("form");
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("No label resolved yet")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Review and move" }).disabled,
    ).toBe(true);
    fireEvent.submit(moveForm);
    expect(
      await screen.findByText(/Scan or resolve an assigned label before moving/i),
    ).toBeTruthy();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("revalidates a resolved assignment before submitting a move", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const initial = fixtureWorkspace();
    const view = renderPanel(initial, { onMove });

    await user.type(
      screen.getByLabelText("Manual opaque payload"),
      LABEL_PAYLOAD,
    );
    await user.click(
      screen.getByRole("button", { name: "Resolve pasted label" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Destination Place"),
      "studio-one",
    );

    const transferredRegistry = transferAssetLabel(
      initial.assetLabelRegistry,
      {
        assignmentId: "asg_abcdef0123456789",
        labelId: LABEL_ID,
        expectedAssetId: "watch-one",
        nextAssetId: "camera-one",
        transferredBy: "member-one",
        transferredAt: "2026-07-25T09:00:00.000Z",
      },
    );
    const changed = {
      ...initial,
      assetLabelRegistry: transferredRegistry,
    };
    view.rerender(
      <AssetLabelPanel
        workspace={changed}
        assets={changed.assets}
        places={changed.places}
        spaces={changed.spaces}
        onMove={onMove}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByText("Active private label")).toBeNull(),
    );

    await user.click(
      screen.getByRole("button", { name: "Review and move" }),
    );

    expect(
      await screen.findByText(/no longer actively assigned to this asset/i),
    ).toBeTruthy();
    expect(screen.getByText("No label resolved yet")).toBeTruthy();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("defensively rejects inactive or reassigned labels at the integrated move boundary", () => {
    const workspace = fixtureWorkspace();
    const command = {
      assetId: "watch-one",
      labelId: LABEL_ID,
      labelAssignmentId: "asg_0123456789abcdef",
    };
    expect(
      resolveActiveLabelAssignmentForMove(workspace, command)?.id,
    ).toBe("asg_0123456789abcdef");

    const inactiveRegistry = unassignAssetLabel(
      workspace.assetLabelRegistry,
      {
        labelId: LABEL_ID,
        expectedAssetId: "watch-one",
        endedBy: "member-one",
        endedAt: "2026-07-25T09:00:00.000Z",
      },
    );
    expect(
      resolveActiveLabelAssignmentForMove(
        { ...workspace, assetLabelRegistry: inactiveRegistry },
        command,
      ),
    ).toBeNull();

    const reassignedRegistry = transferAssetLabel(
      workspace.assetLabelRegistry,
      {
        assignmentId: "asg_abcdef0123456789",
        labelId: LABEL_ID,
        expectedAssetId: "watch-one",
        nextAssetId: "camera-one",
        transferredBy: "member-one",
        transferredAt: "2026-07-25T09:00:00.000Z",
      },
    );
    expect(
      resolveActiveLabelAssignmentForMove(
        { ...workspace, assetLabelRegistry: reassignedRegistry },
        command,
      ),
    ).toBeNull();
  });

  it("reads a QR image with BarcodeDetector and emits a revision-bound move command", async () => {
    const user = userEvent.setup();
    const detect = vi.fn(async () => [{ rawValue: LABEL_PAYLOAD }]);
    class FakeBarcodeDetector {
      static async getSupportedFormats() {
        return ["qr_code"];
      }

      detect = detect;
    }
    window.BarcodeDetector = FakeBarcodeDetector;
    globalThis.createImageBitmap = vi.fn(async () => ({
      close: vi.fn(),
    }));
    const onMove = vi.fn(async () => ({
      kind: "conflict",
      message: "A newer location was saved on another device.",
      currentRevision: 2,
    }));
    renderPanel(fixtureWorkspace(), { onMove });

    const file = new File(["qr-image"], "asset-label.png", {
      type: "image/png",
    });
    await user.upload(
      screen.getByLabelText("Upload QR label image"),
      file,
    );

    expect(
      await screen.findByText(/Label resolved to Travel watch/i),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Destination Place"),
      "studio-one",
    );
    await user.selectOptions(
      screen.getByLabelText("Room, zone, or container"),
      "cabinet-one",
    );
    await user.type(
      screen.getByLabelText(/Exact retrieval detail/i),
      "Shelf B",
    );
    await user.click(
      screen.getByRole("button", { name: "Review and move" }),
    );

    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    const command = onMove.mock.calls[0][0];
    expect(command).toMatchObject({
      type: "MOVE_ASSET",
      assetId: "watch-one",
      labelId: LABEL_ID,
      labelAssignmentId: "asg_0123456789abcdef",
      expectedAssignmentId: "location-watch-one",
      expectedRevision: 1,
      baseRevision: 1,
      placeId: "studio-one",
      spaceId: "cabinet-one",
      locationStatus: "known",
      locationDetail: "Shelf B",
      source: "user",
      captureSource: "asset-label",
    });
    expect(command.to).toEqual({
      status: "known",
      placeId: "studio-one",
      spaceId: "cabinet-one",
      locationDetail: "Shelf B",
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Location conflict/i,
    );
    expect(screen.getByText(/current r2/i)).toBeTruthy();
  });

  it("reads and writes the same opaque MIME payload through Web NFC", async () => {
    const user = userEvent.setup();
    const writes = [];
    class FakeNDEFReader {
      async scan() {
        queueMicrotask(() => {
          this.onreading?.({
            message: {
              records: [
                {
                  recordType: "mime",
                  mediaType: "application/vnd.alyr.asset-label",
                  data: LABEL_PAYLOAD,
                },
              ],
            },
          });
        });
      }

      async write(message) {
        writes.push(message);
      }
    }
    window.NDEFReader = FakeNDEFReader;
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Read NFC tag" }));
    expect(
      await screen.findByText(/NFC tag read and matched/i),
    ).toBeTruthy();
    expect(screen.getAllByText("Travel watch").length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "Write current label" }),
    );
    expect(
      await screen.findByText(/NFC tag written/i),
    ).toBeTruthy();
    expect(writes).toEqual([
      {
        records: [
          {
            recordType: "mime",
            mediaType: "application/vnd.alyr.asset-label",
            data: LABEL_PAYLOAD,
          },
        ],
      },
    ]);
  });

  it("surfaces Web NFC permission denial with a usable recovery instruction", async () => {
    const user = userEvent.setup();
    class DeniedNDEFReader {
      async scan() {
        const error = new Error("denied");
        error.name = "NotAllowedError";
        throw error;
      }
    }
    window.NDEFReader = DeniedNDEFReader;
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Read NFC tag" }));

    expect(
      await screen.findByText(/Permission was not granted/i),
    ).toBeTruthy();
    expect(screen.getByText(/approve the browser prompt/i)).toBeTruthy();
  });

  it("blocks a stale move locally when location changed after label resolution", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const initial = fixtureWorkspace();
    const view = renderPanel(initial, { onMove });

    await user.type(
      screen.getByLabelText("Manual opaque payload"),
      LABEL_PAYLOAD,
    );
    await user.click(
      screen.getByRole("button", { name: "Resolve pasted label" }),
    );
    expect(
      await screen.findByText(/Label resolved to Travel watch/i),
    ).toBeTruthy();

    const changed = fixtureWorkspace({
      locationAssignments: [
        {
          ...initial.locationAssignments[0],
          validTo: "2026-07-25T09:00:00.000Z",
        },
        {
          id: "location-watch-two",
          assetId: "watch-one",
          mode: "physical",
          placeId: "studio-one",
          spaceId: "archive-room",
          locatorText: "Intake shelf",
          validFrom: "2026-07-25T09:00:00.000Z",
          validTo: null,
        },
      ],
    });
    view.rerender(
      <AssetLabelPanel
        workspace={changed}
        assets={changed.assets}
        places={changed.places}
        spaces={changed.spaces}
        onMove={onMove}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Destination Place"),
      "home-one",
    );
    await user.click(
      screen.getByRole("button", { name: "Review and move" }),
    );

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /changed after the label was read/i,
    );
    expect(screen.getByText(/Scanned base r1 · current r2/i)).toBeTruthy();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("has no automatically detectable accessibility violations at rest", async () => {
    renderPanel();
    const result = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
