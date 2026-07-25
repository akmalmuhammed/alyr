import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle,
  FileImage,
  FilePdf,
  FilePlus,
  FloppyDisk,
  Scan,
  SpinnerGap,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  applyDocumentOcrResult,
  appendDocumentScanPage,
  beginDocumentScan,
  createDocumentScanJob,
  failDocumentOcr,
  queueDocumentOcr,
  retryDocumentOcr,
  reviewDocumentOcr,
  startDocumentOcr,
} from "./capturePipeline.js";
import {
  deleteCaptureDraftFile,
  describeLocalFile,
  formatFileSize,
  getCaptureDraftFile,
  putCaptureDraftFile,
  validateLocalFile,
} from "./fileStore.js";
import { createSafePreviewMetadata } from "./securityVault.js";
import {
  LOCAL_DEMO_SCOPE_ID,
  scopedStorageKey,
} from "./storageScope.js";
import "./documentScan.css";

export const DOCUMENT_SCAN_DRAFT_VERSION = 1;
export const DOCUMENT_SCAN_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf";
export const MAX_DOCUMENT_SCAN_PAGES = 24;
export const MAX_DOCUMENT_SCAN_TOTAL_BYTES = 80 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PDF_MIME_TYPE = "application/pdf";

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  const suffix =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

function opaqueId(value, fallback) {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 190);
  return normalized || fallback;
}

function fingerprint(file) {
  return [
    String(file?.name || ""),
    Number(file?.size || 0),
    Number(file?.lastModified || 0),
  ].join(":");
}

function isSupportedScanType(type) {
  const normalized = String(type || "").toLowerCase();
  return IMAGE_MIME_TYPES.has(normalized) || normalized === PDF_MIME_TYPE;
}

function isImagePage(page) {
  return IMAGE_MIME_TYPES.has(String(page?.mimeType || "").toLowerCase());
}

function createObjectPreview(file) {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return "";
  }
  const preview = createSafePreviewMetadata({
    mediaType: file?.type,
    fileName: file?.name,
    sourceBytes: file?.size,
  });
  if (preview.mode !== "inline-original") return "";
  return URL.createObjectURL(file);
}

function revokeObjectPreview(url) {
  if (
    url &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(url);
  }
}

function fileFromRecord(record) {
  if (!record?.blob) return null;
  if (typeof File === "function") {
    return new File([record.blob], record.fileName || "scan-page", {
      type: record.fileType || record.blob.type || "application/octet-stream",
      lastModified: Date.parse(record.storedAt || "") || Date.now(),
    });
  }
  const blob = record.blob;
  try {
    Object.defineProperty(blob, "name", {
      configurable: true,
      value: record.fileName || "scan-page",
    });
  } catch {
    // A Blob without a writable name is still usable by OCR and previews.
  }
  return blob;
}

function defaultMetadataKey(draftKey) {
  return `alyr.document-scan-draft:${String(draftKey || "unassigned")}`;
}

const browserDraftStorage = Object.freeze({
  readMetadata(key) {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  writeMetadata(key, value) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  },
  removeMetadata(key) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
  putFile: putCaptureDraftFile,
  getFile: getCaptureDraftFile,
  removeFile: deleteCaptureDraftFile,
});

function parseDraftMetadata(raw) {
  if (!raw) return null;
  const candidate = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (
    !candidate ||
    candidate.version !== DOCUMENT_SCAN_DRAFT_VERSION ||
    !Array.isArray(candidate.pages)
  ) {
    throw new Error("This draft was created by an unsupported scanner version.");
  }
  return candidate;
}

function buildScanJob({
  pages,
  jobId,
  householdId,
  assetId,
  documentType,
  timestamp = nowIso(),
}) {
  let next = createDocumentScanJob({
    id: opaqueId(jobId, randomId("scan")),
    householdId: opaqueId(householdId, "local-household"),
    assetId: assetId ? opaqueId(assetId, "local-asset") : null,
    documentType,
    createdAt: timestamp,
  });
  if (!pages.length) return next;
  next = beginDocumentScan(next, timestamp);
  for (const [index, page] of pages.entries()) {
    next = appendDocumentScanPage(
      next,
      {
        id: opaqueId(page.id, `page-${index + 1}`),
        mediaId: opaqueId(page.mediaId, `media-${index + 1}`),
        mimeType: page.mimeType,
        checksum: page.checksum || null,
        width: page.width || undefined,
        height: page.height || undefined,
        source: page.source || "file-picker",
        capturedAt: page.capturedAt || timestamp,
      },
      timestamp,
    );
  }
  return next;
}

export function validateDocumentScanSelection(currentPages, selectedFiles) {
  const accepted = [];
  const errors = [];
  const pages = Array.isArray(currentPages) ? currentPages : [];
  const selected = Array.from(selectedFiles || []);
  const seen = new Set(pages.map((page) => page.fingerprint));
  let totalBytes = pages.reduce(
    (sum, page) => sum + Number(page.fileSize || page.file?.size || 0),
    0,
  );

  for (const file of selected) {
    const fileName = String(file?.name || "Selected file");
    const localValidation = validateLocalFile(file);
    if (localValidation) {
      errors.push(`${fileName}: ${localValidation}`);
      continue;
    }
    if (!isSupportedScanType(file.type)) {
      errors.push(`${fileName}: use a JPG, PNG, WebP, or PDF.`);
      continue;
    }
    if (pages.length + accepted.length >= MAX_DOCUMENT_SCAN_PAGES) {
      errors.push(
        `A scan can contain up to ${MAX_DOCUMENT_SCAN_PAGES} source files.`,
      );
      break;
    }
    const key = fingerprint(file);
    if (seen.has(key)) {
      errors.push(`${fileName} is already in this scan.`);
      continue;
    }
    if (totalBytes + file.size > MAX_DOCUMENT_SCAN_TOTAL_BYTES) {
      errors.push("This draft would exceed the 80 MB on-device limit.");
      break;
    }
    seen.add(key);
    totalBytes += file.size;
    accepted.push(file);
  }

  return { accepted, errors };
}

export function composeRecognizedText(pageResults, pages) {
  const pageById = new Map((pages || []).map((page) => [page.id, page]));
  const withText = (pageResults || [])
    .map((result) => ({
      ...result,
      text: String(result?.text || "").trim(),
      page: pageById.get(result?.pageId),
    }))
    .filter((result) => result.text);

  if (withText.length === 1) return withText[0].text;
  return withText
    .map((result) => {
      const ordinal = Number(result.page?.ordinal || 0) || "?";
      const name = result.page?.fileName || `Page ${ordinal}`;
      return `Page ${ordinal} · ${name}\n${result.text}`;
    })
    .join("\n\n");
}

async function createTesseractWorker(logger) {
  const module = await import("tesseract.js");
  return module.createWorker("eng", undefined, { logger });
}

function friendlyOcrError(error) {
  const message = String(error?.message || "");
  if (/network|fetch|load|worker|wasm/i.test(message)) {
    return "The OCR engine could not load. Check your connection, then retry; your pages and edits are still saved locally.";
  }
  return "Text reading stopped before it finished. Your pages and edits are still saved locally—retry when ready.";
}

function pageMetadata(page, index) {
  return {
    id: page.id,
    mediaId: page.mediaId,
    blobId: page.blobId,
    ordinal: index + 1,
    fileName: page.fileName,
    mimeType: page.mimeType,
    fileSize: page.fileSize,
    checksum: page.checksum || null,
    width: page.width || null,
    height: page.height || null,
    source: page.source,
    capturedAt: page.capturedAt,
    storedOnDevice: Boolean(page.storedOnDevice),
    fingerprint: page.fingerprint,
  };
}

export function DocumentScanPanel({
  assetId = null,
  householdId = "local-household",
  documentType = "Document",
  draftKey = assetId ? `asset:${assetId}` : "unassigned",
  initialTitle = "",
  onCommit,
  draftStorage = null,
  storageScopeId = LOCAL_DEMO_SCOPE_ID,
  ocrWorkerFactory = null,
  className = "",
}) {
  const inputId = useId();
  const storage = useMemo(
    () => ({
      ...browserDraftStorage,
      putFile: (id, file) =>
        browserDraftStorage.putFile(id, file, {
          scopeId: storageScopeId,
        }),
      getFile: (id) =>
        browserDraftStorage.getFile(id, {
          scopeId: storageScopeId,
        }),
      removeFile: (id) =>
        browserDraftStorage.removeFile(id, {
          scopeId: storageScopeId,
        }),
      ...(draftStorage || {}),
    }),
    [draftStorage, storageScopeId],
  );
  const metadataKey = useMemo(
    () =>
      scopedStorageKey(
        defaultMetadataKey(draftKey),
        storageScopeId,
      ),
    [draftKey, storageScopeId],
  );
  const [draftId, setDraftId] = useState(() => randomId("document-draft"));
  const [jobId, setJobId] = useState(() => randomId("scan"));
  const [pages, setPages] = useState([]);
  const [title, setTitle] = useState(initialTitle);
  const [extractedText, setExtractedText] = useState("");
  const [job, setJob] = useState(() =>
    buildScanJob({
      pages: [],
      jobId: randomId("scan"),
      householdId,
      assetId,
      documentType,
    }),
  );
  const [hydrated, setHydrated] = useState(false);
  const [draftState, setDraftState] = useState("loading");
  const [restored, setRestored] = useState(false);
  const [notice, setNotice] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrPageLabel, setOcrPageLabel] = useState("");
  const [ocrWarnings, setOcrWarnings] = useState([]);
  const [requiresTextReview, setRequiresTextReview] = useState(false);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitComplete, setCommitComplete] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);
  const inputRef = useRef(null);
  const previewUrlsRef = useRef(new Set());
  const mountedRef = useRef(true);
  const committedRef = useRef(false);

  const makeJob = (nextPages, nextJobId = jobId) =>
    buildScanJob({
      pages: nextPages.map((page, index) => ({
        ...page,
        ordinal: index + 1,
      })),
      jobId: nextJobId,
      householdId,
      assetId,
      documentType,
    });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const url of previewUrlsRef.current) revokeObjectPreview(url);
      previewUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreDraft() {
      try {
        const metadata = parseDraftMetadata(
          await Promise.resolve(storage.readMetadata(metadataKey)),
        );
        if (!metadata) {
          if (!cancelled) {
            setHydrated(true);
            setDraftState("empty");
          }
          return;
        }

        const restoredPages = [];
        let missingCount = 0;
        for (const [index, descriptor] of metadata.pages.entries()) {
          const record = await storage.getFile(descriptor.blobId);
          const file = fileFromRecord(record);
          if (!file) {
            missingCount += 1;
            continue;
          }
          const previewUrl = createObjectPreview(file);
          if (previewUrl) previewUrlsRef.current.add(previewUrl);
          restoredPages.push({
            ...descriptor,
            ordinal: restoredPages.length + 1,
            file,
            fileName: record.fileName || descriptor.fileName,
            mimeType: record.fileType || descriptor.mimeType,
            fileSize: record.fileSize ?? descriptor.fileSize,
            checksum: record.fileChecksum || descriptor.checksum || null,
            previewUrl,
            storedOnDevice: true,
            fingerprint: descriptor.fingerprint || fingerprint(file),
            originalOrdinal: index + 1,
          });
        }
        if (cancelled) {
          for (const page of restoredPages) revokeObjectPreview(page.previewUrl);
          return;
        }

        const restoredJobId = opaqueId(metadata.jobId, randomId("scan"));
        setDraftId(
          opaqueId(metadata.draftId, randomId("document-draft")),
        );
        setJobId(restoredJobId);
        setPages(restoredPages);
        setJob(
          buildScanJob({
            pages: restoredPages,
            jobId: restoredJobId,
            householdId,
            assetId,
            documentType,
            timestamp: metadata.savedAt || nowIso(),
          }),
        );
        setTitle(String(metadata.title || initialTitle));
        setExtractedText(String(metadata.extractedText || ""));
        setRequiresTextReview(Boolean(metadata.requiresTextReview));
        setReviewAcknowledged(Boolean(metadata.reviewAcknowledged));
        setOcrWarnings(
          Array.isArray(metadata.ocrWarnings) ? metadata.ocrWarnings : [],
        );
        setRestored(true);
        setDraftState("saved");
        setHydrated(true);
        setNotice(
          missingCount
            ? {
                kind: "warning",
                text: `${missingCount} locally stored page${
                  missingCount === 1 ? "" : "s"
                } could not be restored. The remaining draft is intact.`,
              }
            : {
                kind: "info",
                text: "Recovered your on-device document draft.",
              },
        );
      } catch (error) {
        if (!cancelled) {
          setHydrated(true);
          setDraftState("error");
          setNotice({
            kind: "error",
            text:
              error?.message ||
              "The saved draft metadata could not be read. Stored originals were not deleted.",
          });
        }
      }
    }

    restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [
    assetId,
    documentType,
    householdId,
    initialTitle,
    metadataKey,
    storage,
  ]);

  useEffect(() => {
    if (!hydrated || committedRef.current) return undefined;
    setDraftState("saving");
    const timeout = window.setTimeout(async () => {
      if (committedRef.current) return;
      const hasDraft =
        pages.length > 0 ||
        title.trim().length > 0 ||
        extractedText.trim().length > 0;
      try {
        if (!hasDraft) {
          await Promise.resolve(storage.removeMetadata(metadataKey));
          if (mountedRef.current) setDraftState("empty");
          return;
        }
        await Promise.resolve(
          storage.writeMetadata(metadataKey, {
            version: DOCUMENT_SCAN_DRAFT_VERSION,
            draftId,
            jobId,
            assetId,
            documentType,
            title,
            extractedText,
            requiresTextReview,
            reviewAcknowledged,
            ocrWarnings,
            pages: pages.map(pageMetadata),
            savedAt: nowIso(),
          }),
        );
        if (mountedRef.current) setDraftState("saved");
      } catch {
        if (mountedRef.current) {
          setDraftState("error");
          setNotice({
            kind: "error",
            text: "Draft metadata could not be saved on this device. Keep this tab open and retry after checking browser storage.",
          });
        }
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [
    assetId,
    documentType,
    draftId,
    extractedText,
    hydrated,
    jobId,
    metadataKey,
    ocrWarnings,
    pages,
    requiresTextReview,
    reviewAcknowledged,
    storage,
    title,
  ]);

  function replacePages(nextPages, message = null) {
    const normalized = nextPages.map((page, index) => ({
      ...page,
      ordinal: index + 1,
    }));
    setPages(normalized);
    setJob(makeJob(normalized));
    setOcrProgress(0);
    setOcrWarnings([]);
    if (extractedText) {
      setRequiresTextReview(true);
      setReviewAcknowledged(false);
      setNotice({
        kind: "warning",
        text:
          message ||
          "The source pages changed. Your edited text is retained; read the pages again or review the retained text before attaching.",
      });
    } else if (message) {
      setNotice({ kind: "info", text: message });
    }
  }

  async function addFiles(fileList) {
    const { accepted, errors } = validateDocumentScanSelection(pages, fileList);
    if (errors.length) {
      setNotice({ kind: "error", text: errors.join(" ") });
    }
    if (!accepted.length) return;

    setIsAdding(true);
    const added = [];
    let storageFailures = 0;
    try {
      for (const file of accepted) {
        const id = randomId("page");
        const blobId = `${draftId}:${id}`;
        let metadata;
        let storedOnDevice = false;
        try {
          metadata = await describeLocalFile(file);
          const stored = await storage.putFile(blobId, file);
          metadata = {
            ...metadata,
            fileName: stored?.fileName || metadata.fileName,
            fileType: stored?.fileType || metadata.fileType,
            fileSize: stored?.fileSize ?? metadata.fileSize,
            fileChecksum:
              stored?.fileChecksum || metadata.fileChecksum || null,
          };
          storedOnDevice = true;
        } catch {
          storageFailures += 1;
          metadata = {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileChecksum: null,
          };
        }
        const previewUrl = createObjectPreview(file);
        if (previewUrl) previewUrlsRef.current.add(previewUrl);
        added.push({
          id,
          mediaId: randomId("media"),
          blobId,
          ordinal: pages.length + added.length + 1,
          file,
          fileName: metadata.fileName,
          mimeType: metadata.fileType,
          fileSize: metadata.fileSize,
          checksum: metadata.fileChecksum,
          width: null,
          height: null,
          source: "file-picker",
          capturedAt: nowIso(),
          storedOnDevice,
          fingerprint: fingerprint(file),
          previewUrl,
        });
      }
      const next = [...pages, ...added];
      setPages(next);
      setJob(makeJob(next));
      setCommitComplete(false);
      if (storageFailures) {
        setNotice({
          kind: "warning",
          text: `${storageFailures} page${
            storageFailures === 1 ? "" : "s"
          } can be used in this tab but could not be saved for recovery. Use “Retry local save” on the page.`,
        });
      } else if (!errors.length) {
        setNotice({
          kind: "info",
          text: `${added.length} page${
            added.length === 1 ? "" : "s"
          } added and saved on this device.`,
        });
      }
    } finally {
      setIsAdding(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function movePage(pageId, offset) {
    if (job.status === "processing-ocr") return;
    const index = pages.findIndex((page) => page.id === pageId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[index], next[target]] = [next[target], next[index]];
    replacePages(next, "Page order updated.");
  }

  async function removePage(pageId) {
    if (job.status === "processing-ocr") return;
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    const next = pages.filter((candidate) => candidate.id !== pageId);
    replacePages(next, `${page.fileName} removed from this draft.`);
    previewUrlsRef.current.delete(page.previewUrl);
    revokeObjectPreview(page.previewUrl);
    if (page.storedOnDevice) {
      try {
        await storage.removeFile(page.blobId);
      } catch {
        setNotice({
          kind: "warning",
          text: "The page was removed from the draft, but its private local cache could not be cleared. Browser storage settings can clear it later.",
        });
      }
    }
  }

  async function retryLocalSave(pageId) {
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page || page.storedOnDevice) return;
    try {
      const stored = await storage.putFile(page.blobId, page.file);
      setPages((current) =>
        current.map((candidate) =>
          candidate.id === pageId
            ? {
                ...candidate,
                storedOnDevice: true,
                checksum:
                  stored?.fileChecksum || candidate.checksum || null,
              }
            : candidate,
        ),
      );
      setNotice({
        kind: "info",
        text: `${page.fileName} is now saved in the recoverable local draft.`,
      });
    } catch {
      setNotice({
        kind: "error",
        text: "This page still cannot be saved locally. Check available browser storage and retry.",
      });
    }
  }

  async function runOcr() {
    const imagePages = pages.filter(isImagePage);
    if (!imagePages.length || job.status === "processing-ocr") return;

    const queuedAt = nowIso();
    const queued =
      job.status === "failed"
        ? retryDocumentOcr(job, {
            adapterId: "tesseract-browser",
            languageHints: ["en"],
            queuedAt,
          })
        : queueDocumentOcr(job, {
            adapterId: "tesseract-browser",
            languageHints: ["en"],
            queuedAt,
          });
    const attemptId = randomId("ocr-attempt");
    const processing = startDocumentOcr(queued, {
      attemptId,
      startedAt: nowIso(),
    });
    setJob(processing);
    setOcrProgress(1);
    setOcrWarnings([]);
    setNotice(null);

    let worker = null;
    let activeImageIndex = 0;
    const logger = (event) => {
      if (!mountedRef.current || event?.status !== "recognizing text") return;
      const pageProgress = Math.max(0, Math.min(1, Number(event.progress) || 0));
      const overall =
        ((activeImageIndex + pageProgress) / imagePages.length) * 100;
      setOcrProgress(Math.max(1, Math.round(overall)));
    };

    try {
      worker = await (ocrWorkerFactory || createTesseractWorker)(logger);
      if (!worker || typeof worker.recognize !== "function") {
        throw new Error("OCR worker did not start.");
      }

      const results = [];
      for (const [index, page] of imagePages.entries()) {
        activeImageIndex = index;
        setOcrPageLabel(`Reading ${page.fileName}`);
        const output = await worker.recognize(page.file);
        const confidence = Math.max(
          0,
          Math.min(1, Number(output?.data?.confidence || 0) / 100),
        );
        results.push({
          pageId: page.id,
          text: String(output?.data?.text || ""),
          confidence,
          language: "en",
        });
        setOcrProgress(Math.round(((index + 1) / imagePages.length) * 100));
      }

      const skippedPdfs = pages.filter(
        (page) => page.mimeType === PDF_MIME_TYPE,
      );
      const warnings = skippedPdfs.length
        ? [
            `${skippedPdfs.length} PDF source${
              skippedPdfs.length === 1 ? " was" : "s were"
            } kept and previewed, but not read by browser OCR. Add photographed image pages if you need their text extracted.`,
          ]
        : [];
      const resultById = new Map(results.map((result) => [result.pageId, result]));
      const completeResults = pages.map(
        (page) =>
          resultById.get(page.id) || {
            pageId: page.id,
            text: "",
            confidence: 0,
            language: null,
          },
      );
      const reviewed = applyDocumentOcrResult(processing, {
        attemptId,
        result: {
          adapterId: "tesseract-browser",
          adapterVersion: "6",
          pages: completeResults,
          proposedFields: [],
          warnings,
        },
        completedAt: nowIso(),
      });
      setJob(reviewed);
      setExtractedText(composeRecognizedText(results, pages));
      setRequiresTextReview(true);
      setReviewAcknowledged(false);
      setOcrWarnings(warnings);
      setOcrPageLabel("");
      setOcrProgress(100);
      setNotice({
        kind: "info",
        text: "Text reading finished. Compare and edit it against the original pages before attaching.",
      });
    } catch (error) {
      const failed = failDocumentOcr(processing, {
        attemptId,
        code: "BROWSER_OCR_FAILED",
        message: friendlyOcrError(error),
        retryable: true,
        failedAt: nowIso(),
      });
      setJob(failed);
      setOcrPageLabel("");
      setOcrProgress(0);
      setNotice({ kind: "error", text: failed.lastError.message });
    } finally {
      try {
        await worker?.terminate?.();
      } catch {
        // A completed/failed job remains recoverable even if worker cleanup fails.
      }
    }
  }

  async function clearStoredDraft() {
    const failures = [];
    for (const page of pages) {
      if (!page.storedOnDevice) continue;
      try {
        await storage.removeFile(page.blobId);
      } catch {
        failures.push(page.blobId);
      }
    }
    try {
      await Promise.resolve(storage.removeMetadata(metadataKey));
    } catch {
      failures.push(metadataKey);
    }
    return failures;
  }

  async function discardDraft() {
    if (!discardArmed) {
      setDiscardArmed(true);
      return;
    }
    const failures = await clearStoredDraft();
    for (const page of pages) {
      previewUrlsRef.current.delete(page.previewUrl);
      revokeObjectPreview(page.previewUrl);
    }
    const nextJobId = randomId("scan");
    committedRef.current = true;
    setPages([]);
    setTitle(initialTitle);
    setExtractedText("");
    setRequiresTextReview(false);
    setReviewAcknowledged(false);
    setOcrWarnings([]);
    setOcrProgress(0);
    setJobId(nextJobId);
    setJob(
      buildScanJob({
        pages: [],
        jobId: nextJobId,
        householdId,
        assetId,
        documentType,
      }),
    );
    setDraftId(randomId("document-draft"));
    setRestored(false);
    setDiscardArmed(false);
    setDraftState("empty");
    setNotice({
      kind: failures.length ? "warning" : "info",
      text: failures.length
        ? "The draft was cleared here, but some browser-stored data could not be removed."
        : "Local document draft discarded.",
    });
    window.setTimeout(() => {
      committedRef.current = false;
    }, 0);
  }

  async function commitDocument() {
    if (!title.trim()) {
      setNotice({ kind: "error", text: "Add a document title to continue." });
      return;
    }
    if (!pages.length) {
      setNotice({ kind: "error", text: "Add at least one source page." });
      return;
    }
    if (requiresTextReview && !reviewAcknowledged) {
      setNotice({
        kind: "error",
        text: "Review the extracted text and confirm the comparison before attaching.",
      });
      return;
    }
    if (typeof onCommit !== "function") {
      setNotice({
        kind: "error",
        text: "This scanner has no attachment destination yet. Your local draft is safe.",
      });
      return;
    }

    setIsCommitting(true);
    setNotice(null);
    try {
      const reviewedAt = nowIso();
      const completedJob =
        job.status === "needs-review"
          ? reviewDocumentOcr(job, {
              decisions: [],
              reviewedBy: "local-user",
              reviewedAt,
            })
          : job;
      await onCommit({
        draftId,
        assetId,
        documentType,
        title: title.trim(),
        text: extractedText.trim(),
        files: pages.map((page) => page.file),
        pages: pages.map((page, index) => ({
          ...pageMetadata(page, index),
          blobId: undefined,
          storedOnDevice: undefined,
          fingerprint: undefined,
        })),
        ocr: {
          status:
            completedJob.status === "completed"
              ? "user-reviewed"
              : job.status === "failed"
                ? "failed-not-required"
                : "not-run",
          engine:
            completedJob.status === "completed" ? "tesseract.js-browser" : null,
          warnings: ocrWarnings,
          reviewedAt:
            completedJob.status === "completed" ? reviewedAt : null,
          legalAccuracy: "not-verified",
        },
        capturedAt: pages[0]?.capturedAt || reviewedAt,
        committedAt: reviewedAt,
      });
      committedRef.current = true;
      const cleanupFailures = await clearStoredDraft();
      setJob(completedJob);
      setCommitComplete(true);
      setDraftState(cleanupFailures.length ? "error" : "empty");
      setNotice({
        kind: cleanupFailures.length ? "warning" : "success",
        text: cleanupFailures.length
          ? "Document attached, but the recoverable local draft could not be fully cleared."
          : "Document attached. The temporary local draft was cleared.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error?.message ||
          "The document could not be attached. Nothing was discarded; retry when ready.",
      });
    } finally {
      setIsCommitting(false);
    }
  }

  const busy = isAdding || job.status === "processing-ocr" || isCommitting;
  const imagePageCount = pages.filter(isImagePage).length;
  const pdfPageCount = pages.filter(
    (page) => page.mimeType === PDF_MIME_TYPE,
  ).length;
  const totalBytes = pages.reduce(
    (sum, page) => sum + Number(page.fileSize || 0),
    0,
  );
  const canCommit =
    pages.length > 0 &&
    title.trim().length > 0 &&
    (!requiresTextReview || reviewAcknowledged) &&
    !busy &&
    !commitComplete;

  return (
    <section
      className={`document-scan-panel ${className}`.trim()}
      aria-labelledby={`${inputId}-heading`}
    >
      <header className="document-scan-header">
        <div>
          <span className="document-scan-kicker">Private document capture</span>
          <h2 id={`${inputId}-heading`}>Build a readable record</h2>
          <p>
            Keep the original pages beside text you can search, correct, and
            understand later.
          </p>
        </div>
        <div className="document-scan-draft-state" data-state={draftState}>
          {draftState === "saving" ? (
            <SpinnerGap aria-hidden="true" className="document-scan-spin" />
          ) : draftState === "error" ? (
            <WarningCircle aria-hidden="true" />
          ) : (
            <FloppyDisk aria-hidden="true" />
          )}
          <span>
            {draftState === "loading"
              ? "Checking for draft"
              : draftState === "saving"
                ? "Saving locally"
                : draftState === "saved"
                  ? "Draft saved locally"
                  : draftState === "error"
                    ? "Local save needs attention"
                    : "No pending draft"}
          </span>
        </div>
      </header>

      {restored && (
        <div className="document-scan-restored" role="status">
          <CheckCircle aria-hidden="true" />
          <div>
            <strong>Draft recovered</strong>
            <span>Your pages, order, title, and text were restored here.</span>
          </div>
          <button
            type="button"
            onClick={() => setRestored(false)}
            aria-label="Dismiss draft recovered message"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      {notice && (
        <div
          className="document-scan-notice"
          data-kind={notice.kind}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.kind === "success" || notice.kind === "info" ? (
            <CheckCircle aria-hidden="true" />
          ) : (
            <WarningCircle aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="document-scan-workspace">
        <div className="document-scan-source-column">
          <div className="document-scan-section-heading">
            <div>
              <span className="document-scan-step">01</span>
              <h3>Source pages</h3>
            </div>
            <span>
              {pages.length}/{MAX_DOCUMENT_SCAN_PAGES} ·{" "}
              {formatFileSize(totalBytes)}
            </span>
          </div>

          <label
            className="document-scan-dropzone"
            htmlFor={`${inputId}-files`}
            onDragOver={(event) => {
              event.preventDefault();
              event.currentTarget.dataset.dragging = "true";
            }}
            onDragLeave={(event) => {
              delete event.currentTarget.dataset.dragging;
            }}
            onDrop={(event) => {
              event.preventDefault();
              delete event.currentTarget.dataset.dragging;
              addFiles(event.dataTransfer.files);
            }}
          >
            {isAdding ? (
              <SpinnerGap aria-hidden="true" className="document-scan-spin" />
            ) : (
              <FilePlus aria-hidden="true" />
            )}
            <span>
              <strong>{pages.length ? "Add more pages" : "Choose pages"}</strong>
              <small>JPG, PNG, WebP, or PDF · up to 25 MB each</small>
            </span>
            <span className="document-scan-dropzone-action">Browse</span>
            <input
              ref={inputRef}
              id={`${inputId}-files`}
              type="file"
              accept={DOCUMENT_SCAN_ACCEPT}
              multiple
              disabled={busy}
              onChange={(event) => addFiles(event.target.files)}
            />
          </label>

          {pages.length ? (
            <ol className="document-scan-contact-sheet" aria-label="Scan pages">
              {pages.map((page, index) => (
                <li
                  className="document-scan-page"
                  key={page.id}
                  data-file-type={
                    page.mimeType === PDF_MIME_TYPE ? "pdf" : "image"
                  }
                >
                  <div className="document-scan-page-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="document-scan-preview">
                    {page.mimeType === PDF_MIME_TYPE ? (
                      <FilePdf aria-hidden="true" />
                    ) : page.previewUrl ? (
                      <img
                        src={page.previewUrl}
                        alt={`Preview of ${page.fileName}`}
                      />
                    ) : (
                      <FileImage aria-hidden="true" />
                    )}
                    <span className="document-scan-file-badge">
                      {page.mimeType === PDF_MIME_TYPE ? "PDF" : "IMAGE"}
                    </span>
                  </div>
                  <div className="document-scan-page-caption">
                    <div>
                      <strong title={page.fileName}>{page.fileName}</strong>
                      <span>
                        {formatFileSize(page.fileSize)} ·{" "}
                        {page.storedOnDevice
                          ? "saved on device"
                          : "not recoverable yet"}
                      </span>
                      {page.mimeType === PDF_MIME_TYPE ? (
                        <span>
                          Original retained · inline preview disabled until a sanitized rendition exists
                        </span>
                      ) : null}
                    </div>
                    <div className="document-scan-page-actions">
                      <button
                        type="button"
                        onClick={() => movePage(page.id, -1)}
                        disabled={busy || index === 0}
                        aria-label={`Move ${page.fileName} earlier`}
                      >
                        <ArrowUp aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePage(page.id, 1)}
                        disabled={busy || index === pages.length - 1}
                        aria-label={`Move ${page.fileName} later`}
                      >
                        <ArrowDown aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="document-scan-remove"
                        onClick={() => removePage(page.id)}
                        disabled={busy}
                        aria-label={`Remove ${page.fileName}`}
                      >
                        <Trash aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {!page.storedOnDevice && (
                    <button
                      className="document-scan-retry-save"
                      type="button"
                      onClick={() => retryLocalSave(page.id)}
                      disabled={busy}
                    >
                      Retry local save
                    </button>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="document-scan-empty">
              <div aria-hidden="true">
                <span>01</span>
                <span>02</span>
                <span>03</span>
              </div>
              <p>
                Add photographed pages in reading order, or attach a PDF for a
                real browser preview.
              </p>
            </div>
          )}
        </div>

        <div className="document-scan-review-column">
          <div className="document-scan-section-heading">
            <div>
              <span className="document-scan-step">02</span>
              <h3>Read &amp; review</h3>
            </div>
            <span>{imagePageCount} readable image page{imagePageCount === 1 ? "" : "s"}</span>
          </div>

          <div className="document-scan-ocr-intro">
            <Scan aria-hidden="true" />
            <div>
              <strong>Browser OCR</strong>
              <p>
                The OCR engine downloads on first use, then reads supported
                image pages in this browser. This panel does not upload your
                document.
              </p>
            </div>
          </div>

          {pdfPageCount > 0 && (
            <p className="document-scan-pdf-limit">
              <FilePdf aria-hidden="true" />
              PDF originals stay attached and are available for download after
              save. Browser OCR reads image pages only; it does not extract PDF
              text.
            </p>
          )}

          {job.status === "processing-ocr" ? (
            <div className="document-scan-progress" aria-live="polite">
              <div>
                <span>{ocrPageLabel || "Starting OCR"}</span>
                <strong>{ocrProgress}%</strong>
              </div>
              <progress value={ocrProgress} max="100">
                {ocrProgress}%
              </progress>
              <small>Keep this tab open. The local draft remains saved.</small>
            </div>
          ) : (
            <button
              type="button"
              className="document-scan-ocr-button"
              onClick={runOcr}
              disabled={!imagePageCount || busy || commitComplete}
            >
              <Scan aria-hidden="true" />
              <span>
                <strong>
                  {job.status === "failed"
                    ? "Retry OCR"
                    : extractedText || requiresTextReview
                      ? "Read pages again"
                      : "Read text from images"}
                </strong>
                <small>
                  {imagePageCount
                    ? "OCR output stays editable"
                    : "Add a JPG, PNG, or WebP page"}
                </small>
              </span>
            </button>
          )}

          {(requiresTextReview || extractedText || job.status === "needs-review") && (
            <div className="document-scan-text-review">
              <label htmlFor={`${inputId}-text`}>
                Extracted text
                <span>Edit anything the reader misunderstood.</span>
              </label>
              <textarea
                id={`${inputId}-text`}
                aria-label="Extracted text"
                value={extractedText}
                onChange={(event) => {
                  setExtractedText(event.target.value);
                  setRequiresTextReview(true);
                  setReviewAcknowledged(false);
                }}
                rows={12}
                disabled={job.status === "processing-ocr" || commitComplete}
                placeholder="No text was recognized. You can type a careful transcription here."
              />
              {ocrWarnings.map((warning) => (
                <p className="document-scan-inline-warning" key={warning}>
                  <WarningCircle aria-hidden="true" />
                  {warning}
                </p>
              ))}
              <label className="document-scan-review-check">
                <input
                  type="checkbox"
                  checked={reviewAcknowledged}
                  onChange={(event) =>
                    setReviewAcknowledged(event.target.checked)
                  }
                  disabled={commitComplete}
                />
                <span aria-hidden="true">
                  <Check />
                </span>
                <strong>
                  I compared this text with the original pages and corrected
                  what I could.
                </strong>
              </label>
            </div>
          )}

          <div className="document-scan-commit">
            <div className="document-scan-section-heading">
              <div>
                <span className="document-scan-step">03</span>
                <h3>Name &amp; attach</h3>
              </div>
            </div>
            <label htmlFor={`${inputId}-title`}>
              Document title
              <input
                id={`${inputId}-title`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                disabled={commitComplete}
                placeholder="e.g. 2026 insurance policy"
              />
            </label>
            <p className="document-scan-accuracy-note">
              <WarningCircle aria-hidden="true" />
              OCR is a reading aid, not legal verification. Keep the original
              and check important names, dates, values, and reference numbers.
            </p>
            <button
              type="button"
              className="document-scan-commit-button"
              onClick={commitDocument}
              disabled={!canCommit}
            >
              {isCommitting ? (
                <SpinnerGap aria-hidden="true" className="document-scan-spin" />
              ) : commitComplete ? (
                <CheckCircle aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {isCommitting
                ? "Attaching…"
                : commitComplete
                  ? "Attached"
                  : "Attach reviewed document"}
            </button>
          </div>
        </div>
      </div>

      {!commitComplete && (pages.length > 0 || title || extractedText) && (
        <footer className="document-scan-footer">
          <span>
            Draft files stay in this browser until attached or explicitly
            discarded.
          </span>
          <div>
            {discardArmed && (
              <button
                type="button"
                className="document-scan-cancel-discard"
                onClick={() => setDiscardArmed(false)}
              >
                Keep draft
              </button>
            )}
            <button
              type="button"
              className="document-scan-discard"
              onClick={discardDraft}
              disabled={busy}
            >
              <Trash aria-hidden="true" />
              {discardArmed ? "Confirm discard" : "Discard local draft"}
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}

export default DocumentScanPanel;
