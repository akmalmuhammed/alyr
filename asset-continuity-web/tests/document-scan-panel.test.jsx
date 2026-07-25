// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/fileStore.js", () => ({
  validateLocalFile: vi.fn((file) =>
    file && file.size > 0 ? "" : "Choose a file to continue.",
  ),
  describeLocalFile: vi.fn(async (file) => ({
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    fileChecksum: `sha256-${file.name}`,
  })),
  formatFileSize: vi.fn((bytes) => `${Number(bytes)} B`),
  putCaptureDraftFile: vi.fn(),
  getCaptureDraftFile: vi.fn(),
  deleteCaptureDraftFile: vi.fn(),
}));

import {
  DOCUMENT_SCAN_DRAFT_VERSION,
  DocumentScanPanel,
  composeRecognizedText,
  validateDocumentScanSelection,
} from "../src/DocumentScanPanel.jsx";

function makeStorage({ metadata = null, records = new Map() } = {}) {
  let savedMetadata = metadata;
  return {
    records,
    readMetadata: vi.fn(() => savedMetadata),
    writeMetadata: vi.fn((_key, value) => {
      savedMetadata = value;
    }),
    removeMetadata: vi.fn(() => {
      savedMetadata = null;
    }),
    putFile: vi.fn(async (id, file) => {
      const record = {
        id,
        blob: file,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileChecksum: `sha256-${file.name}`,
        storedAt: "2026-07-25T00:00:00.000Z",
      };
      records.set(id, record);
      return record;
    }),
    getFile: vi.fn(async (id) => records.get(id) || null),
    removeFile: vi.fn(async (id) => {
      records.delete(id);
    }),
  };
}

function imageFile(name = "page-one.jpg") {
  return new File(["image bytes"], name, {
    type: "image/jpeg",
    lastModified: 1,
  });
}

function pdfFile(name = "policy.pdf") {
  return new File(["pdf bytes"], name, {
    type: "application/pdf",
    lastModified: 2,
  });
}

beforeEach(() => {
  let objectUrlIndex = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => `blob:test-${++objectUrlIndex}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("document scan selection helpers", () => {
  it("rejects duplicate and unsupported sources without discarding valid pages", () => {
    const existing = [
      {
        fingerprint: "page-one.jpg:11:1",
        fileSize: 11,
      },
    ];
    const duplicate = new File(["image bytes"], "page-one.jpg", {
      type: "image/jpeg",
      lastModified: 1,
    });
    const unsupported = new File(["notes"], "notes.txt", {
      type: "text/plain",
      lastModified: 2,
    });
    const valid = pdfFile();

    const result = validateDocumentScanSelection(existing, [
      duplicate,
      unsupported,
      valid,
    ]);

    expect(result.accepted).toEqual([valid]);
    expect(result.errors.join(" ")).toMatch(/already in this scan/i);
    expect(result.errors.join(" ")).toMatch(/JPG, PNG, WebP, or PDF/i);
  });

  it("composes page-labelled text only when more than one page has text", () => {
    expect(
      composeRecognizedText(
        [{ pageId: "p1", text: "Single page text" }],
        [{ id: "p1", ordinal: 1, fileName: "one.jpg" }],
      ),
    ).toBe("Single page text");

    expect(
      composeRecognizedText(
        [
          { pageId: "p1", text: "First" },
          { pageId: "p2", text: "Second" },
        ],
        [
          { id: "p1", ordinal: 1, fileName: "front.jpg" },
          { id: "p2", ordinal: 2, fileName: "back.jpg" },
        ],
      ),
    ).toBe("Page 1 · front.jpg\nFirst\n\nPage 2 · back.jpg\nSecond");
  });
});

describe("DocumentScanPanel", () => {
  it("previews, reorders, removes, and commits real selected files in visible order", async () => {
    const user = userEvent.setup();
    const storage = makeStorage();
    const onCommit = vi.fn(async () => {});
    const { container } = render(
      <DocumentScanPanel
        draftStorage={storage}
        draftKey="test-order"
        onCommit={onCommit}
      />,
    );

    const photo = imageFile("front.jpg");
    const policy = pdfFile("policy.pdf");
    const back = imageFile("back.jpg");
    await user.upload(
      screen.getByLabelText(/choose pages/i),
      [photo, policy, back],
    );

    expect(await screen.findByText("front.jpg")).toBeTruthy();
    expect(screen.getByText("policy.pdf")).toBeTruthy();
    expect(screen.getByText("back.jpg")).toBeTruthy();
    expect(
      container.querySelector('img[alt="Preview of front.jpg"]'),
    ).toBeTruthy();
    expect(container.querySelector("iframe, object, embed, audio, video")).toBeNull();
    expect(
      screen.getByText(/policy\.pdf/i).closest("li").textContent,
    ).toMatch(/inline preview disabled.*sanitized rendition/i);

    await user.click(
      screen.getByRole("button", { name: "Move policy.pdf earlier" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove back.jpg" }),
    );
    await waitFor(() => {
      expect(screen.queryByText("back.jpg")).toBeNull();
    });
    expect(storage.removeFile).toHaveBeenCalledTimes(1);
    const cards = screen.getByRole("list", { name: "Scan pages" });
    const filenames = within(cards)
      .getAllByRole("listitem")
      .map((card) => within(card).getByText(/\.(jpg|pdf)$/i).textContent);
    expect(filenames).toEqual(["policy.pdf", "front.jpg"]);

    await user.type(
      screen.getByRole("textbox", { name: "Document title" }),
      "Home insurance policy",
    );
    expect(screen.getByText(/OCR is a reading aid, not legal verification/i)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Attach reviewed document" }),
    );

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const payload = onCommit.mock.calls[0][0];
    expect(payload.title).toBe("Home insurance policy");
    expect(payload.files.map((file) => file.name)).toEqual([
      "policy.pdf",
      "front.jpg",
    ]);
    expect(payload.ocr.legalAccuracy).toBe("not-verified");
    expect(await screen.findByText(/temporary local draft was cleared/i)).toBeTruthy();
  });

  it("shows OCR progress, keeps extracted text editable, and requires review", async () => {
    const user = userEvent.setup();
    const storage = makeStorage();
    const onCommit = vi.fn(async () => {});
    const terminate = vi.fn(async () => {});
    const ocrWorkerFactory = vi.fn(async (logger) => ({
      recognize: vi.fn(async () => {
        logger({ status: "recognizing text", progress: 0.55 });
        return {
          data: {
            text: "Policy number O0-123",
            confidence: 87,
          },
        };
      }),
      terminate,
    }));

    render(
      <DocumentScanPanel
        draftStorage={storage}
        draftKey="test-ocr"
        onCommit={onCommit}
        ocrWorkerFactory={ocrWorkerFactory}
      />,
    );

    await user.upload(screen.getByLabelText(/choose pages/i), imageFile());
    await user.type(
      screen.getByRole("textbox", { name: "Document title" }),
      "Insurance record",
    );
    await user.click(
      screen.getByRole("button", { name: /Read text from images/i }),
    );

    const textArea = await screen.findByRole("textbox", {
      name: "Extracted text",
    });
    expect(textArea.value).toBe("Policy number O0-123");
    expect(terminate).toHaveBeenCalledTimes(1);

    const attach = screen.getByRole("button", {
      name: "Attach reviewed document",
    });
    expect(attach.disabled).toBe(true);

    await user.clear(textArea);
    await user.type(textArea, "Policy number 00-123");
    await user.click(
      screen.getByRole("checkbox", {
        name: /I compared this text with the original pages/i,
      }),
    );
    expect(attach.disabled).toBe(false);
    await user.click(attach);

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit.mock.calls[0][0].text).toBe("Policy number 00-123");
    expect(onCommit.mock.calls[0][0].ocr.status).toBe("user-reviewed");
    expect(onCommit.mock.calls[0][0].ocr.engine).toBe("tesseract.js-browser");
  });

  it("keeps the draft after an OCR error and offers a real retry path", async () => {
    const user = userEvent.setup();
    const storage = makeStorage();
    let attempt = 0;
    const ocrWorkerFactory = vi.fn(async () => ({
      recognize: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("worker failed to load");
        return { data: { text: "Recovered text", confidence: 91 } };
      }),
      terminate: vi.fn(async () => {}),
    }));

    render(
      <DocumentScanPanel
        draftStorage={storage}
        draftKey="test-retry"
        onCommit={vi.fn()}
        ocrWorkerFactory={ocrWorkerFactory}
      />,
    );

    await user.upload(screen.getByLabelText(/choose pages/i), imageFile());
    await user.click(
      screen.getByRole("button", { name: /Read text from images/i }),
    );

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /could not load|still saved locally/i,
    );
    expect(screen.getByText("page-one.jpg")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Retry OCR/i }));
    expect(
      (await screen.findByRole("textbox", { name: "Extracted text" })).value,
    ).toBe("Recovered text");
    expect(ocrWorkerFactory).toHaveBeenCalledTimes(2);
  });

  it("recovers page blobs, order, title, and editable text from local metadata", async () => {
    const file = imageFile("recovered.jpg");
    const blobId = "draft-1:page-1";
    const records = new Map([
      [
        blobId,
        {
          id: blobId,
          blob: file,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          fileChecksum: "sha256-recovered",
          storedAt: "2026-07-25T00:00:00.000Z",
        },
      ],
    ]);
    const storage = makeStorage({
      records,
      metadata: {
        version: DOCUMENT_SCAN_DRAFT_VERSION,
        draftId: "draft-1",
        jobId: "scan-1",
        assetId: null,
        documentType: "Document",
        title: "Recovered deed",
        extractedText: "Editable recovered text",
        requiresTextReview: true,
        reviewAcknowledged: false,
        ocrWarnings: [],
        pages: [
          {
            id: "page-1",
            mediaId: "media-1",
            blobId,
            ordinal: 1,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            checksum: "sha256-recovered",
            source: "file-picker",
            capturedAt: "2026-07-25T00:00:00.000Z",
            storedOnDevice: true,
            fingerprint: "recovered.jpg:11:1",
          },
        ],
        savedAt: "2026-07-25T00:00:00.000Z",
      },
    });

    render(
      <DocumentScanPanel
        draftStorage={storage}
        draftKey="test-recovery"
        onCommit={vi.fn()}
      />,
    );

    expect(await screen.findByText("Draft recovered")).toBeTruthy();
    expect(screen.getByText("recovered.jpg")).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Document title" }).value,
    ).toBe("Recovered deed");
    expect(
      screen.getByRole("textbox", { name: "Extracted text" }).value,
    ).toBe("Editable recovered text");
    expect(storage.getFile).toHaveBeenCalledWith(blobId);
  });
});
