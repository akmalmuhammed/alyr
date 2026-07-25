// @vitest-environment jsdom

import React from "react";
import axe from "axe-core";
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
import { RoomCapturePanel } from "../src/RoomCapturePanel.jsx";
import {
  appendRoomCaptureMedia,
  createRoomCaptureSession,
  pauseRoomCaptureSession,
} from "../src/capturePipeline.js";
import {
  createMemoryRoomCaptureStore,
  createRoomCaptureLocalRef,
  createRoomCaptureSessionId,
  validateRoomCaptureImage,
} from "../src/roomCaptureStore.js";

const CONTEXT = Object.freeze({
  householdId: "household-001",
  createdBy: "member-owner",
  placeId: "west-bay-home",
  placeName: "West Bay Home",
  roomId: "study",
  roomName: "Study",
});

const SESSION_ID = createRoomCaptureSessionId({
  householdId: CONTEXT.householdId,
  placeId: CONTEXT.placeId,
  spaceId: CONTEXT.roomId,
  createdBy: CONTEXT.createdBy,
});

function makeClock() {
  let minute = 0;
  return () => {
    const value = `2026-07-25T09:${String(minute).padStart(2, "0")}:00.000Z`;
    minute += 1;
    return value;
  };
}

function makeIdFactory() {
  let value = 0;
  return (prefix) => {
    value += 1;
    return `${prefix}-${String(value).padStart(3, "0")}`;
  };
}

async function describeFixture(file) {
  return {
    fileName: file.name,
    mimeType: file.type,
    byteSize: file.size,
    checksum: `sha256-${file.name}-${file.size}`,
  };
}

function createHarness() {
  const storage = createMemoryRoomCaptureStore({
    describeFile: describeFixture,
  });
  return {
    storage,
    clock: makeClock(),
    createId: makeIdFactory(),
    onCommit: vi.fn(async () => {}),
  };
}

function renderPanel(harness, overrides = {}) {
  return render(
    <RoomCapturePanel
      {...CONTEXT}
      storage={harness.storage}
      clock={harness.clock}
      createId={harness.createId}
      onCommit={harness.onCommit}
      {...overrides}
    />,
  );
}

describe("production-honest room batch capture", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob) => `blob:room-capture-${blob.size}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps an ordered, checksummed local batch and cleans it after commit", async () => {
    const user = userEvent.setup();
    const harness = createHarness();
    renderPanel(harness);

    expect(
      await screen.findByRole("heading", {
        name: "Photograph the room once. Sort it later.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Only on this device")).toBeTruthy();
    expect(
      screen.getByText(/No cloud backup or cross-device upload is running/i),
    ).toBeTruthy();

    const wide = new File(["wide room"], "wide-view.jpg", {
      type: "image/jpeg",
    });
    const detail = new File(["drawer detail"], "drawer-detail.png", {
      type: "image/png",
    });
    await user.upload(
      screen.getByLabelText("Choose photos for Study"),
      [wide, detail],
    );

    expect(
      await screen.findByAltText("Room photo 1: wide-view.jpg"),
    ).toBeTruthy();
    expect(screen.getByAltText("Room photo 2: drawer-detail.png")).toBeTruthy();
    expect(screen.getAllByText(/checksum saved/)).toHaveLength(2);

    const savedBeforeCommit = await harness.storage.loadSession(SESSION_ID, {
      householdId: CONTEXT.householdId,
      placeId: CONTEXT.placeId,
      spaceId: CONTEXT.roomId,
      createdBy: CONTEXT.createdBy,
    });
    expect(savedBeforeCommit.session.media).toHaveLength(2);
    expect(savedBeforeCommit.files).toHaveLength(2);

    await user.click(
      screen.getByRole("button", {
        name: "Move drawer-detail.png earlier",
      }),
    );
    await waitFor(() => {
      const list = screen.getByRole("list", {
        name: "Room photos in saved order",
      });
      expect(
        within(list)
          .getAllByRole("img")
          .map((image) => image.alt),
      ).toEqual([
        "Room photo 1: drawer-detail.png",
        "Room photo 2: wide-view.jpg",
      ]);
    });

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(await screen.findByText("Paused · checkpoint saved")).toBeTruthy();
    expect(screen.getByLabelText("Choose photos for Study").disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await screen.findByText("Capturing");

    await user.click(screen.getByRole("button", { name: "Finish room" }));

    await waitFor(() => expect(harness.onCommit).toHaveBeenCalledTimes(1));
    const payload = harness.onCommit.mock.calls[0][0];
    expect(payload.localOnly).toBe(true);
    expect(payload.createdBy).toBe(CONTEXT.createdBy);
    expect(payload.storage).toEqual({
      kind: "indexeddb-local",
      cloudBackedUp: false,
      crossDeviceAvailable: false,
    });
    expect(payload.media.map((media) => media.fileName)).toEqual([
      "drawer-detail.png",
      "wide-view.jpg",
    ]);
    expect(payload.media.map((media) => media.ordinal)).toEqual([1, 2]);
    expect(payload.media.every((media) => media.checksum)).toBe(true);
    expect(payload.media.every((media) => media.blob instanceof Blob)).toBe(
      true,
    );
    expect(
      await harness.storage.loadSession(SESSION_ID),
    ).toBeNull();
    expect(
      await screen.findByRole("heading", {
        name: "2 photos kept in order",
      }),
    ).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("validates the empty state instead of claiming an empty batch was saved", async () => {
    const user = userEvent.setup();
    const harness = createHarness();
    renderPanel(harness);

    await screen.findByText("Ready to capture");
    await user.click(screen.getByRole("button", { name: "Finish room" }));

    expect(
      screen.getByRole("alert").textContent,
    ).toMatch(/Add at least one room photo/i);
    expect(harness.onCommit).not.toHaveBeenCalled();
    const saved = await harness.storage.loadSession(SESSION_ID);
    expect(saved.session.status).toBe("draft");
    expect(saved.session.media).toHaveLength(0);
  });

  it("recovers a paused checkpoint with its thumbnail and resumes safely", async () => {
    const user = userEvent.setup();
    const harness = createHarness();
    const photo = new File(["saved room"], "saved-room.webp", {
      type: "image/webp",
    });
    const description = await describeFixture(photo);
    let session = createRoomCaptureSession({
      id: SESSION_ID,
      householdId: CONTEXT.householdId,
      placeId: CONTEXT.placeId,
      spaceId: CONTEXT.roomId,
      createdBy: CONTEXT.createdBy,
      createdAt: "2026-07-25T08:00:00.000Z",
    });
    session = appendRoomCaptureMedia(
      session,
      {
        id: "room-photo-saved",
        localRef: createRoomCaptureLocalRef(
          SESSION_ID,
          "room-photo-saved",
        ),
        kind: "photo",
        mimeType: description.mimeType,
        checksum: description.checksum,
        byteSize: description.byteSize,
        source: "file-picker",
        capturedAt: "2026-07-25T08:01:00.000Z",
      },
      "2026-07-25T08:01:00.000Z",
    );
    await harness.storage.addMedia(
      session,
      [
        {
          mediaId: "room-photo-saved",
          file: photo,
          description,
        },
      ],
      "2026-07-25T08:01:00.000Z",
    );
    session = pauseRoomCaptureSession(
      session,
      "2026-07-25T08:02:00.000Z",
    );
    await harness.storage.saveCheckpoint(
      session,
      "2026-07-25T08:02:00.000Z",
    );

    renderPanel(harness);

    expect(
      await screen.findByText(
        "Recovered 1 saved photo from this device.",
      ),
    ).toBeTruthy();
    expect(
      await screen.findByAltText("Room photo 1: saved-room.webp"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Take photo for Study").disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByText("Capturing")).toBeTruthy();
    expect(screen.getByLabelText("Take photo for Study").disabled).toBe(false);
  });

  it("keeps the prior checkpoint when local media persistence fails", async () => {
    const user = userEvent.setup();
    const harness = createHarness();
    harness.storage = {
      ...harness.storage,
      addMedia: vi.fn(async () => {
        throw new Error("The browser ran out of local storage.");
      }),
    };
    renderPanel(harness);
    await screen.findByText("Ready to capture");

    const photo = new File(["room"], "room.jpg", {
      type: "image/jpeg",
    });
    await user.upload(
      screen.getByLabelText("Choose photos for Study"),
      photo,
    );

    expect(
      await screen.findByText("The browser ran out of local storage."),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    const saved = await harness.storage.loadSession(SESSION_ID);
    expect(saved.session.media).toHaveLength(0);
    expect(harness.onCommit).not.toHaveBeenCalled();
  });

  it("retries a failed destination with the same idempotent commit identity", async () => {
    const user = userEvent.setup();
    const harness = createHarness();
    harness.onCommit
      .mockRejectedValueOnce(new Error("Destination is temporarily unavailable."))
      .mockResolvedValueOnce(undefined);
    renderPanel(harness);
    await screen.findByText("Ready to capture");
    await user.upload(
      screen.getByLabelText("Choose photos for Study"),
      new File(["room"], "room.jpg", { type: "image/jpeg" }),
    );
    await screen.findByAltText("Room photo 1: room.jpg");

    await user.click(screen.getByRole("button", { name: "Finish room" }));
    expect(
      await screen.findByText(/commit identity were kept for a safe retry/i),
    ).toBeTruthy();
    const pending = await harness.storage.loadSession(SESSION_ID);
    expect(pending.session.status).toBe("committed");
    expect(pending.session.commitId).toBeTruthy();
    const firstCommitId = harness.onCommit.mock.calls[0][0].commitId;

    await user.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(harness.onCommit).toHaveBeenCalledTimes(2));
    expect(harness.onCommit.mock.calls[1][0].commitId).toBe(firstCommitId);
    expect(await harness.storage.loadSession(SESSION_ID)).toBeNull();
  });

  it("requires two steps to discard and removes the local checkpoint", async () => {
    const user = userEvent.setup();
    const harness = createHarness();
    const onDiscard = vi.fn();
    renderPanel(harness, { onDiscard });
    await screen.findByText("Ready to capture");
    await user.upload(
      screen.getByLabelText("Choose photos for Study"),
      new File(["room"], "room.jpg", { type: "image/jpeg" }),
    );
    await screen.findByAltText("Room photo 1: room.jpg");

    await user.click(screen.getByRole("button", { name: "Discard batch" }));
    expect(
      screen.getByText(/Delete this checkpoint and all temporary photo originals/i),
    ).toBeTruthy();
    expect(await harness.storage.loadSession(SESSION_ID)).not.toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Discard local copies" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Room capture discarded",
      }),
    ).toBeTruthy();
    expect(await harness.storage.loadSession(SESSION_ID)).toBeNull();
    expect(onDiscard).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      placeId: CONTEXT.placeId,
      roomId: CONTEXT.roomId,
    });
  });

  it("has no serious accessibility violations in its actionable empty state", async () => {
    const harness = createHarness();
    const { container } = renderPanel(harness);
    await screen.findByText("Ready to capture");

    const report = await axe.run(container, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(report.violations).toEqual([]);
  });
});

describe("room capture image validation", () => {
  it("scopes deterministic room checkpoints to the active member", () => {
    const ownerSessionId = createRoomCaptureSessionId({
      householdId: CONTEXT.householdId,
      placeId: CONTEXT.placeId,
      spaceId: CONTEXT.roomId,
      createdBy: "member-owner",
    });
    const coOwnerSessionId = createRoomCaptureSessionId({
      householdId: CONTEXT.householdId,
      placeId: CONTEXT.placeId,
      spaceId: CONTEXT.roomId,
      createdBy: "member-co-owner",
    });

    expect(ownerSessionId).toBe(SESSION_ID);
    expect(coOwnerSessionId).not.toBe(ownerSessionId);
  });

  it("refuses to recover another member's checkpoint", async () => {
    const storage = createMemoryRoomCaptureStore({
      describeFile: describeFixture,
    });
    const session = createRoomCaptureSession({
      id: SESSION_ID,
      householdId: CONTEXT.householdId,
      placeId: CONTEXT.placeId,
      spaceId: CONTEXT.roomId,
      createdBy: CONTEXT.createdBy,
      createdAt: "2026-07-25T08:00:00.000Z",
    });
    await storage.saveCheckpoint(session, "2026-07-25T08:00:00.000Z");

    await expect(
      storage.loadSession(SESSION_ID, {
        householdId: CONTEXT.householdId,
        placeId: CONTEXT.placeId,
        spaceId: CONTEXT.roomId,
        createdBy: "member-co-owner",
      }),
    ).rejects.toMatchObject({ code: "CAPTURE_CONTEXT_MISMATCH" });
  });

  it("accepts previewable images and rejects empty or unsupported files", () => {
    expect(
      validateRoomCaptureImage(
        new File(["photo"], "room.jpg", { type: "image/jpeg" }),
      ),
    ).toBe("");
    expect(
      validateRoomCaptureImage(
        new File([], "empty.png", { type: "image/png" }),
      ),
    ).toMatch(/empty/i);
    expect(
      validateRoomCaptureImage(
        new File(["pdf"], "room.pdf", { type: "application/pdf" }),
      ),
    ).toMatch(/supported JPG, PNG, or WebP/i);
  });
});
