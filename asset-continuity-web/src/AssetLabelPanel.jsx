import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowRight,
  ArrowsClockwise,
  Broadcast,
  CheckCircle,
  Copy,
  DownloadSimple,
  MapPinLine,
  QrCode,
  Scan,
  ShieldCheck,
  Tag,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  ASSET_LABEL_MEDIA_TYPE,
  assignAssetLabel,
  createLabelRegistry,
  createNfcAssetLabelRecord,
  decodeAssetLabel,
  encodeAssetLabel,
  evaluateMovementCommand,
  resolveAssetLabel,
  unassignAssetLabel,
} from "./capturePipeline.js";
import "./assetLabels.css";

const MAX_QR_IMAGE_BYTES = 12 * 1024 * 1024;

function nowIso() {
  return new Date().toISOString();
}

function cryptoApi() {
  return globalThis.crypto;
}

export function createOpaqueLabelId(prefix = "lbl") {
  const crypto = cryptoApi();
  if (!crypto?.getRandomValues) {
    throw new Error(
      "Secure random label generation is unavailable in this browser.",
    );
  }
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${token}`;
}

function labelRegistryFrom(workspace) {
  const candidate =
    workspace?.assetLabelRegistry ||
    workspace?.labelRegistry ||
    workspace?.capture?.labelRegistry;
  if (
    candidate?.householdId &&
    Array.isArray(candidate.assignments)
  ) {
    return candidate;
  }
  return createLabelRegistry({
    householdId:
      workspace?.household?.id || workspace?.householdId || "local-household",
    createdAt: nowIso(),
  });
}

function memberIdFrom(workspace) {
  return (
    workspace?.currentMemberId ||
    workspace?.household?.ownerMemberId ||
    workspace?.members?.[0]?.id ||
    "local-user"
  );
}

function deviceIdFrom(workspace) {
  return workspace?.deviceId || "web-label-panel";
}

function activeLocationAssignment(workspace, asset) {
  const history = (workspace?.locationAssignments || [])
    .filter((assignment) => assignment.assetId === asset.id)
    .sort((left, right) => {
      const leftTime = Date.parse(
        left.validFrom || left.observedAt || left.createdAt || 0,
      );
      const rightTime = Date.parse(
        right.validFrom || right.observedAt || right.createdAt || 0,
      );
      return leftTime - rightTime;
    });
  const active =
    [...history].reverse().find((assignment) => !assignment.validTo) || null;
  if (!active) return null;
  const explicitRevision = Number(active.revision);
  const revision = Number.isInteger(explicitRevision) && explicitRevision >= 0
    ? explicitRevision
    : history.findIndex((assignment) => assignment.id === active.id) + 1;
  return {
    ...active,
    id: active.id,
    assetId: asset.id,
    revision,
    status:
      asset.locationStatus ||
      (active.placeId
        ? active.spaceId || active.locatorText
          ? "known"
          : "needs-detail"
        : "unknown"),
    placeId: active.placeId || null,
    spaceId: active.spaceId || null,
    locationDetail: active.locationDetail || active.locatorText || null,
  };
}

function locationSnapshot(workspace, asset) {
  const assignment = activeLocationAssignment(workspace, asset);
  return {
    assignment,
    assignmentId: assignment?.id || null,
    revision: assignment?.revision || 0,
  };
}

function displayLocation(asset, places, spaces) {
  if (!asset) return "No asset resolved";
  if (!asset.placeId) {
    return asset.locationMode === "virtual"
      ? "Virtual location"
      : "Location not recorded";
  }
  const place = places.find((candidate) => candidate.id === asset.placeId);
  const space = spaces.find((candidate) => candidate.id === asset.spaceId);
  return [
    place?.name || "Unknown place",
    space?.name,
    asset.locationDetail,
  ]
    .filter(Boolean)
    .join(" · ");
}

function buildSpacePath(space, spaces) {
  if (!space) return "";
  const byId = new Map(spaces.map((candidate) => [candidate.id, candidate]));
  const names = [];
  const visited = new Set();
  let current = space;
  while (current && !visited.has(current.id)) {
    names.unshift(current.name);
    visited.add(current.id);
    current = current.parentSpaceId
      ? byId.get(current.parentSpaceId)
      : null;
  }
  return names.join(" › ");
}

function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function renderQrPayload(payload) {
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 3,
    width: 312,
    color: {
      dark: "#07111fff",
      light: "#ffffffff",
    },
  });
  return svgDataUri(svg);
}

function barcodeDetectorApi() {
  return typeof window !== "undefined" ? window.BarcodeDetector : undefined;
}

function ndefReaderApi() {
  return typeof window !== "undefined" ? window.NDEFReader : undefined;
}

function isSecureBrowserContext() {
  return typeof window === "undefined" || window.isSecureContext !== false;
}

async function imageSourceFor(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      dispose() {
        bitmap.close?.();
      },
    };
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The image could not be opened."));
      image.src = objectUrl;
    });
    return {
      source: image,
      dispose() {
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function detectQrPayload(file) {
  const Detector = barcodeDetectorApi();
  if (typeof Detector !== "function") {
    const error = new Error(
      "QR image reading is not available in this browser.",
    );
    error.code = "QR_READER_UNAVAILABLE";
    throw error;
  }
  if (typeof Detector.getSupportedFormats === "function") {
    const formats = await Detector.getSupportedFormats();
    if (!formats.includes("qr_code")) {
      const error = new Error(
        "This browser can detect barcodes, but not QR codes.",
      );
      error.code = "QR_FORMAT_UNAVAILABLE";
      throw error;
    }
  }
  const detector = new Detector({ formats: ["qr_code"] });
  const prepared = await imageSourceFor(file);
  try {
    const detections = await detector.detect(prepared.source);
    const supportedPayload = (detections || [])
      .map((item) => String(item.rawValue || "").trim())
      .find((value) => {
        try {
          decodeAssetLabel(value);
          return true;
        } catch {
          return false;
        }
      });
    if (!supportedPayload) {
      const error = new Error(
        detections?.length
          ? "A code was found, but it is not a Heldat asset label."
          : "No QR code was found. Try a sharper, evenly lit image.",
      );
      error.code = "LABEL_NOT_FOUND";
      throw error;
    }
    return supportedPayload;
  } finally {
    prepared.dispose();
  }
}

function ndefRecordText(record) {
  if (!record) return "";
  if (
    record.mediaType &&
    String(record.mediaType).toLowerCase() !== ASSET_LABEL_MEDIA_TYPE
  ) {
    return "";
  }
  if (typeof record.data === "string") return record.data;
  const data = record.data;
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  return "";
}

function nfcErrorMessage(error, action) {
  if (error?.name === "NotAllowedError") {
    return `Permission was not granted. Keep the page open, tap ${action} again, and approve the browser prompt.`;
  }
  if (error?.name === "SecurityError") {
    return "Web NFC requires a secure HTTPS page and a supported Android browser.";
  }
  if (error?.name === "NotSupportedError") {
    return "This device or browser does not support the requested NFC operation.";
  }
  if (error?.name === "AbortError") {
    return "The NFC operation was cancelled before a tag was read.";
  }
  return error?.message || `The NFC ${action} could not be completed.`;
}

function StatusMessage({ status }) {
  if (!status?.message) return null;
  const Icon =
    status.tone === "success"
      ? CheckCircle
      : status.tone === "danger" || status.tone === "warning"
        ? WarningCircle
        : ShieldCheck;
  return (
    <div
      className="alp-status"
      data-tone={status.tone || "info"}
      role={status.tone === "danger" ? "alert" : "status"}
      aria-live="polite"
    >
      <Icon size={18} weight="duotone" aria-hidden="true" />
      <span>{status.message}</span>
    </div>
  );
}

function CapabilityChip({ available, blocked = false, children }) {
  return (
    <span
      className="alp-capability"
      data-state={blocked ? "blocked" : available ? "available" : "unavailable"}
    >
      <span aria-hidden="true" />
      {children}
    </span>
  );
}

export function AssetLabelPanel({
  workspace = {},
  assets: assetsProp,
  places: placesProp,
  spaces: spacesProp,
  onMove,
  onLabelRegistryChange,
}) {
  const assets = assetsProp || workspace.assets || [];
  const places = placesProp || workspace.places || [];
  const spaces = spacesProp || workspace.spaces || [];
  const activeAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset &&
          asset.lifecycleStatus !== "archived" &&
          asset.kind !== "memory",
      ),
    [assets],
  );
  const activePlaces = useMemo(
    () => places.filter((place) => place.status !== "archived"),
    [places],
  );
  const [registry, setRegistry] = useState(() =>
    labelRegistryFrom(workspace),
  );
  const [selectedAssetId, setSelectedAssetId] = useState(
    activeAssets[0]?.id || "",
  );
  const [assetQuery, setAssetQuery] = useState("");
  const [labelId, setLabelId] = useState("");
  const [payload, setPayload] = useState("");
  const [createdQr, setCreatedQr] = useState(null);
  const [createStatus, setCreateStatus] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [nfcStatus, setNfcStatus] = useState(null);
  const [manualPayload, setManualPayload] = useState("");
  const [resolvedContext, setResolvedContext] = useState(null);
  const [destinationPlaceId, setDestinationPlaceId] = useState("");
  const [destinationSpaceId, setDestinationSpaceId] = useState("");
  const [destinationDetail, setDestinationDetail] = useState("");
  const [moveStatus, setMoveStatus] = useState(null);
  const [moveConflict, setMoveConflict] = useState(null);
  const nfcAbortRef = useRef(null);
  const visibleAssets = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    const matching = query
      ? activeAssets.filter((asset) =>
          [
            asset.name,
            asset.category,
            asset.reference,
            asset.locationDetail,
          ].some((value) =>
            String(value || "").toLowerCase().includes(query),
          ),
        )
      : activeAssets;
    const limited = matching.slice(0, 40);
    const selected = activeAssets.find(
      (asset) => asset.id === selectedAssetId,
    );
    return selected && !limited.some((asset) => asset.id === selected.id)
      ? [selected, ...limited].slice(0, 40)
      : limited;
  }, [activeAssets, assetQuery, selectedAssetId]);

  const qrReaderAvailable = typeof barcodeDetectorApi() === "function";
  const nfcHardwareAvailable = typeof ndefReaderApi() === "function";
  const secureContext = isSecureBrowserContext();
  const nfcAvailable = nfcHardwareAvailable && secureContext;
  const selectedAsset = activeAssets.find(
    (asset) => asset.id === selectedAssetId,
  );
  const activeLabelAssignment = registry.assignments.find(
    (assignment) =>
      assignment.assetId === selectedAssetId && !assignment.endedAt,
  );
  const resolvedAsset = assets.find(
    (asset) => asset.id === resolvedContext?.assetId,
  );
  const destinationSpaces = spaces.filter(
    (space) => space.placeId === destinationPlaceId,
  );

  useEffect(() => {
    if (
      selectedAssetId &&
      !activeAssets.some((asset) => asset.id === selectedAssetId)
    ) {
      setSelectedAssetId(activeAssets[0]?.id || "");
    }
  }, [activeAssets, selectedAssetId]);

  useEffect(() => {
    const incoming =
      workspace?.assetLabelRegistry ||
      workspace?.labelRegistry ||
      workspace?.capture?.labelRegistry;
    if (!incoming?.householdId || !Array.isArray(incoming.assignments)) return;
    setRegistry((current) => {
      if (current.householdId !== incoming.householdId) return incoming;
      return Number(incoming.revision || 0) > Number(current.revision || 0)
        ? incoming
        : current;
    });
  }, [
    workspace?.assetLabelRegistry,
    workspace?.labelRegistry,
    workspace?.capture?.labelRegistry,
  ]);

  useEffect(
    () => () => {
      nfcAbortRef.current?.abort();
    },
    [],
  );

  function captureResolvedContext(assignment, sourceLabelId) {
    const asset = assets.find((candidate) => candidate.id === assignment.assetId);
    if (!asset) {
      setResolvedContext(null);
      setScanStatus({
        tone: "warning",
        message:
          "The label is assigned, but its asset is not available in this workspace.",
      });
      return null;
    }
    const snapshot = locationSnapshot(workspace, asset);
    const context = {
      labelId: sourceLabelId,
      assetId: asset.id,
      labelAssignmentId: assignment.id,
      baseAssignmentId: snapshot.assignmentId,
      baseRevision: snapshot.revision,
      resolvedAt: nowIso(),
    };
    setResolvedContext(context);
    setSelectedAssetId(asset.id);
    setMoveStatus(null);
    setMoveConflict(null);
    return context;
  }

  async function commitRegistry(nextRegistry) {
    if (typeof onLabelRegistryChange === "function") {
      const result = await onLabelRegistryChange(nextRegistry);
      if (
        result?.kind === "conflict" ||
        result?.status === "conflict" ||
        result?.conflict
      ) {
        const error = new Error(
          "The label registry changed elsewhere. Refresh before printing this label.",
        );
        error.code = "LABEL_REGISTRY_CONFLICT";
        throw error;
      }
    }
    setRegistry(nextRegistry);
  }

  async function createLabel() {
    if (!selectedAsset) {
      setCreateStatus({
        tone: "danger",
        message: "Choose an asset before creating its label.",
      });
      return;
    }
    setCreateStatus({
      tone: "info",
      message: "Creating a private, opaque label…",
    });
    try {
      const nextLabelId = createOpaqueLabelId("lbl");
      const nextPayload = encodeAssetLabel(nextLabelId);
      const nextQrImage = await renderQrPayload(nextPayload);
      const assignedAt = nowIso();
      const nextRegistry = assignAssetLabel(registry, {
        assignmentId: createOpaqueLabelId("asg"),
        labelId: nextLabelId,
        assetId: selectedAsset.id,
        assignedBy: memberIdFrom(workspace),
        assignedAt,
        source: "qr",
      });
      await commitRegistry(nextRegistry);
      const assignment = resolveAssetLabel(nextRegistry, nextLabelId);
      setLabelId(nextLabelId);
      setPayload(nextPayload);
      setCreatedQr({
        labelId: nextLabelId,
        payload: nextPayload,
        assetId: selectedAsset.id,
        assetName: selectedAsset.name,
        qrImage: nextQrImage,
      });
      setManualPayload(nextPayload);
      captureResolvedContext(assignment, nextLabelId);
      setCreateStatus({
        tone: typeof onLabelRegistryChange === "function" ? "success" : "warning",
        message:
          typeof onLabelRegistryChange === "function"
            ? `Label created and assigned to ${selectedAsset.name}.`
            : `Label prepared for ${selectedAsset.name}. Connect label saving before printing it for long-term use.`,
      });
    } catch (error) {
      setCreateStatus({
        tone: "danger",
        message: error?.message || "The label could not be created.",
      });
    }
  }

  async function deactivateLabel(assignment) {
    if (!assignment || !selectedAsset) return;
    try {
      const nextRegistry = unassignAssetLabel(registry, {
        labelId: assignment.labelId,
        expectedAssetId: selectedAsset.id,
        endedBy: memberIdFrom(workspace),
        endedAt: nowIso(),
      });
      await commitRegistry(nextRegistry);
      setCreatedQr(null);
      setPayload("");
      setLabelId("");
      setCreateStatus({
        tone: "success",
        message:
          "Label assignment deactivated. Existing printed codes no longer resolve to this asset.",
      });
      if (resolvedContext?.labelId === assignment.labelId) {
        setResolvedContext(null);
        setMoveStatus(null);
        setMoveConflict(null);
        setScanStatus({
          tone: "warning",
          message:
            "This label was deactivated. Scan or resolve another active label before moving an asset.",
        });
      }
    } catch (error) {
      setCreateStatus({
        tone: "danger",
        message:
          error?.message ||
          "The label assignment could not be deactivated.",
      });
    }
  }

  function resolvePayload(rawPayload, source = "manual") {
    try {
      const decoded = decodeAssetLabel(rawPayload);
      const assignment = resolveAssetLabel(registry, decoded.labelId);
      setPayload(decoded.payload);
      setLabelId(decoded.labelId);
      setManualPayload(decoded.payload);
      if (!assignment) {
        setResolvedContext(null);
        setScanStatus({
          tone: "warning",
          message:
            "This is a valid Heldat label, but it is not assigned in this workspace.",
        });
        return null;
      }
      const context = captureResolvedContext(assignment, decoded.labelId);
      if (context) {
        const asset = assets.find((candidate) => candidate.id === context.assetId);
        setScanStatus({
          tone: "success",
          message: `${source === "nfc" ? "NFC tag" : "Label"} resolved to ${asset.name}. Location revision r${context.baseRevision} is locked for review.`,
        });
      }
      return context;
    } catch (error) {
      setResolvedContext(null);
      setScanStatus({
        tone: "danger",
        message: error?.message || "This label could not be read.",
      });
      return null;
    }
  }

  async function scanQrImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setScanStatus({
        tone: "danger",
        message: "Choose an image containing a QR label.",
      });
      return;
    }
    if (file.size > MAX_QR_IMAGE_BYTES) {
      setScanStatus({
        tone: "danger",
        message: "Choose a QR image smaller than 12 MB.",
      });
      return;
    }
    if (!qrReaderAvailable) {
      setScanStatus({
        tone: "warning",
        message:
          "This browser cannot read QR images. Paste the label payload below, use NFC, or open this page in a browser with BarcodeDetector.",
      });
      return;
    }
    setScanStatus({
      tone: "info",
      message: `Reading ${file.name}…`,
    });
    try {
      const scannedPayload = await detectQrPayload(file);
      resolvePayload(scannedPayload, "qr");
    } catch (error) {
      setScanStatus({
        tone: error?.code?.includes("UNAVAILABLE") ? "warning" : "danger",
        message:
          error?.message ||
          "The QR label could not be read from this image.",
      });
    }
  }

  async function copyPayload(value = payload) {
    if (!value) return;
    if (!navigator.clipboard?.writeText) {
      setCreateStatus({
        tone: "warning",
        message:
          "Clipboard access is unavailable. Select and copy the payload from the fallback field.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCreateStatus({
        tone: "success",
        message: "Opaque label payload copied.",
      });
    } catch {
      setCreateStatus({
        tone: "warning",
        message:
          "The browser blocked clipboard access. Select and copy the fallback payload instead.",
      });
    }
  }

  async function writeNfc() {
    if (!payload || !labelId) {
      setNfcStatus({
        tone: "warning",
        message: "Create or resolve a label before writing an NFC tag.",
      });
      return;
    }
    if (!nfcAvailable) {
      setNfcStatus({
        tone: "warning",
        message: nfcHardwareAvailable
          ? "Web NFC is blocked because this page is not in a secure browser context."
          : "Web NFC is unavailable here. Use the QR label or a supported Android browser.",
      });
      return;
    }
    setNfcStatus({
      tone: "info",
      message: "Ready to write. Hold an unlocked NFC tag near the device.",
    });
    try {
      const Reader = ndefReaderApi();
      const writer = new Reader();
      await writer.write({
        records: [createNfcAssetLabelRecord(labelId)],
      });
      setNfcStatus({
        tone: "success",
        message:
          "NFC tag written. Scan it once before attaching it to confirm the assignment.",
      });
    } catch (error) {
      setNfcStatus({
        tone: "danger",
        message: nfcErrorMessage(error, "write"),
      });
    }
  }

  async function readNfc() {
    if (!nfcAvailable) {
      setNfcStatus({
        tone: "warning",
        message: nfcHardwareAvailable
          ? "Web NFC is blocked because this page is not in a secure browser context."
          : "Web NFC is unavailable here. Upload a QR image or paste its opaque payload.",
      });
      return;
    }
    nfcAbortRef.current?.abort();
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    nfcAbortRef.current = controller;
    setNfcStatus({
      tone: "info",
      message: "Ready to scan. Hold the NFC tag near the device.",
    });
    try {
      const Reader = ndefReaderApi();
      const reader = new Reader();
      reader.onreading = (event) => {
        const records = event?.message?.records || [];
        const labelRecord = records.find(
          (record) =>
            !record.mediaType ||
            String(record.mediaType).toLowerCase() === ASSET_LABEL_MEDIA_TYPE,
        );
        const nfcPayload = ndefRecordText(labelRecord);
        if (!nfcPayload) {
          setNfcStatus({
            tone: "danger",
            message: "The NFC tag does not contain a supported Heldat label.",
          });
          return;
        }
        const context = resolvePayload(nfcPayload, "nfc");
        setNfcStatus(
          context
            ? {
                tone: "success",
                message: "NFC tag read and matched to this workspace.",
              }
            : {
                tone: "warning",
                message:
                  "The NFC tag was read, but its label is not available in this workspace.",
              },
        );
        controller?.abort();
      };
      reader.onreadingerror = () => {
        setNfcStatus({
          tone: "danger",
          message:
            "The tag was detected but could not be read. Hold it steady and try again.",
        });
      };
      await reader.scan(controller ? { signal: controller.signal } : undefined);
    } catch (error) {
      setNfcStatus({
        tone: "danger",
        message: nfcErrorMessage(error, "scan"),
      });
    }
  }

  function refreshMoveContext() {
    if (!resolvedAsset) return;
    const snapshot = locationSnapshot(workspace, resolvedAsset);
    setResolvedContext((current) => ({
      ...current,
      baseAssignmentId: snapshot.assignmentId,
      baseRevision: snapshot.revision,
      resolvedAt: nowIso(),
    }));
    setMoveConflict(null);
    setMoveStatus({
      tone: "info",
      message: `Location context refreshed to revision r${snapshot.revision}. Review the destination before moving.`,
    });
  }

  async function submitMove(event) {
    event.preventDefault();
    setMoveStatus(null);
    setMoveConflict(null);
    if (!resolvedAsset || !resolvedContext) {
      setMoveStatus({
        tone: "danger",
        message: "Scan or resolve an assigned label before moving an asset.",
      });
      return;
    }
    let currentLabelAssignment = null;
    try {
      currentLabelAssignment = resolveAssetLabel(
        registry,
        resolvedContext.labelId,
      );
    } catch {
      currentLabelAssignment = null;
    }
    if (
      !currentLabelAssignment ||
      currentLabelAssignment.id !== resolvedContext.labelAssignmentId ||
      currentLabelAssignment.assetId !== resolvedContext.assetId
    ) {
      setResolvedContext(null);
      setMoveStatus({
        tone: "danger",
        message:
          "This label is no longer actively assigned to this asset. Scan or resolve it again before moving.",
      });
      return;
    }
    const place = activePlaces.find(
      (candidate) => candidate.id === destinationPlaceId,
    );
    if (!place) {
      setMoveStatus({
        tone: "danger",
        message: "Choose a destination Place.",
      });
      return;
    }
    const selectedSpace = destinationSpaceId
      ? destinationSpaces.find(
          (candidate) => candidate.id === destinationSpaceId,
        )
      : null;
    if (destinationSpaceId && !selectedSpace) {
      setMoveStatus({
        tone: "danger",
        message: "Choose a space inside the selected Place.",
      });
      return;
    }

    const currentSnapshot = locationSnapshot(workspace, resolvedAsset);
    if (
      currentSnapshot.assignmentId !== resolvedContext.baseAssignmentId ||
      currentSnapshot.revision !== resolvedContext.baseRevision
    ) {
      setMoveConflict({
        message:
          "This asset’s location changed after the label was read. Nothing was moved.",
        currentRevision: currentSnapshot.revision,
        baseRevision: resolvedContext.baseRevision,
      });
      return;
    }

    const proposedAt = nowIso();
    const locationDetail = destinationDetail.trim() || null;
    const command = {
      type: "MOVE_ASSET",
      id: createOpaqueLabelId("move"),
      commandId: null,
      assetId: resolvedAsset.id,
      labelId: resolvedContext.labelId,
      labelAssignmentId: resolvedContext.labelAssignmentId,
      expectedAssignmentId: currentSnapshot.assignmentId,
      expectedRevision: currentSnapshot.revision,
      baseRevision: currentSnapshot.revision,
      to: {
        status: selectedSpace || locationDetail ? "known" : "needs-detail",
        placeId: place.id,
        spaceId: selectedSpace?.id || null,
        locationDetail,
      },
      placeId: place.id,
      spaceId: selectedSpace?.id || null,
      locationMode: "physical",
      locationStatus:
        selectedSpace || locationDetail ? "known" : "needs-detail",
      locationDetail,
      proposedBy: memberIdFrom(workspace),
      deviceId: deviceIdFrom(workspace),
      proposedAt,
      observedAt: proposedAt,
      newAssignmentId: createOpaqueLabelId("loc"),
      assignmentId: null,
      source: "user",
      captureSource: "asset-label",
      reason: "Moved after resolving asset label",
    };
    command.commandId = command.id;
    command.assignmentId = command.newAssignmentId;

    let evaluation;
    try {
      evaluation = evaluateMovementCommand(
        currentSnapshot.assignment,
        command,
      );
    } catch (error) {
      setMoveStatus({
        tone: "danger",
        message: error?.message || "The move command is invalid.",
      });
      return;
    }
    if (evaluation.kind === "already-satisfied") {
      setMoveStatus({
        tone: "success",
        message: "The asset is already recorded at this destination.",
      });
      return;
    }
    if (evaluation.kind === "conflict") {
      setMoveConflict({
        message:
          "The local location revision is stale. Nothing was moved; refresh and review the latest location.",
        currentRevision:
          evaluation.conflict?.current?.revision ?? currentSnapshot.revision,
        baseRevision: command.baseRevision,
      });
      return;
    }
    if (typeof onMove !== "function") {
      setMoveStatus({
        tone: "warning",
        message:
          "The move command is valid, but saving is not connected. Nothing was changed.",
      });
      return;
    }

    setMoveStatus({
      tone: "info",
      message: `Sending move from location revision r${command.baseRevision}…`,
    });
    try {
      const result = await onMove(command, evaluation);
      if (result?.code === "LABEL_ASSIGNMENT_CHANGED") {
        setResolvedContext(null);
        setMoveConflict(null);
        setMoveStatus({
          tone: "danger",
          message:
            result?.message ||
            "This label is no longer actively assigned to this asset. Scan or resolve it again before moving.",
        });
        return;
      }
      const conflict =
        result?.kind === "conflict" ||
        result?.kind === "stale" ||
        result?.status === "conflict" ||
        result?.status === "stale" ||
        result?.conflict;
      if (conflict) {
        setMoveStatus(null);
        setMoveConflict({
          message:
            result?.message ||
            result?.conflict?.message ||
            "The location changed on another device. Nothing was moved; review the latest location first.",
          currentRevision:
            result?.currentRevision ||
            result?.conflict?.current?.revision ||
            "newer",
          baseRevision: command.baseRevision,
        });
        return;
      }
      if (result === false) {
        throw new Error("The workspace did not accept the move command.");
      }
      setMoveStatus({
        tone: result?.kind === "apply" || result?.status === "saved"
          ? "success"
          : "info",
        message:
          result?.kind === "apply" || result?.status === "saved"
            ? `${resolvedAsset.name} was moved to ${place.name}${selectedSpace ? ` · ${buildSpacePath(selectedSpace, spaces)}` : ""}.`
            : "Move command sent. Confirm the new location in the asset’s history.",
      });
    } catch (error) {
      const isConflict =
        /stale|conflict|revision/i.test(
          `${error?.code || ""} ${error?.message || ""}`,
        );
      if (isConflict) {
        setMoveStatus(null);
        setMoveConflict({
          message:
            "The location changed before this move could be saved. Nothing was moved.",
          currentRevision: "newer",
          baseRevision: command.baseRevision,
        });
      } else {
        setMoveStatus({
          tone: "danger",
          message:
            error?.message ||
            "The move could not be saved. The current location is unchanged.",
        });
      }
    }
  }

  return (
    <section className="asset-label-panel" aria-labelledby="asset-label-title">
      <header className="alp-header">
        <div>
          <span className="alp-eyebrow">Findability system</span>
          <h2 id="asset-label-title">Asset labels</h2>
          <p>
            Create an opaque QR or NFC key, resolve it privately, then move the
            matched asset with revision protection.
          </p>
        </div>
        <div className="alp-capabilities" aria-label="Label capabilities">
          <CapabilityChip available>
            QR creation
          </CapabilityChip>
          <CapabilityChip available={qrReaderAvailable}>
            QR image reading
          </CapabilityChip>
          <CapabilityChip
            available={nfcAvailable}
            blocked={nfcHardwareAvailable && !secureContext}
          >
            Web NFC
          </CapabilityChip>
        </div>
      </header>

      <div className="alp-privacy-note">
        <ShieldCheck size={21} weight="duotone" aria-hidden="true" />
        <p>
          <strong>The label contains no name, value, or location.</strong>{" "}
          It carries only a random identifier and integrity check. The private
          workspace performs the match after scanning.
        </p>
      </div>

      <div className="alp-workflow">
        <article className="alp-card">
          <div className="alp-step-heading">
            <span className="alp-step-number">01</span>
            <span className="alp-icon">
              <Tag size={22} weight="duotone" aria-hidden="true" />
            </span>
            <div>
              <h3>Create a label</h3>
              <p>Choose the passport this physical label should open.</p>
            </div>
          </div>

          <label className="alp-field">
            <span>Find asset</span>
            <input
              type="search"
              value={assetQuery}
              onChange={(event) => setAssetQuery(event.target.value)}
              placeholder="Name, category, reference, or location"
            />
            <small>
              {assetQuery
                ? `${visibleAssets.length} matching passports`
                : `Showing ${Math.min(40, activeAssets.length)} of ${activeAssets.length}`}
            </small>
          </label>

          <label className="alp-field">
            <span>Asset</span>
            <select
              value={selectedAssetId}
              onChange={(event) => {
                setSelectedAssetId(event.target.value);
                setCreateStatus(null);
              }}
            >
              {activeAssets.length ? null : (
                <option value="">No label-ready assets</option>
              )}
              {visibleAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="alp-primary-button"
            type="button"
            onClick={createLabel}
            disabled={!selectedAsset}
          >
            <QrCode size={20} weight="bold" aria-hidden="true" />
            Create private QR
          </button>
          <StatusMessage status={createStatus} />

          {activeLabelAssignment && !createdQr ? (
            <div className="alp-active-assignment">
              <span>
                <CheckCircle size={18} weight="duotone" aria-hidden="true" />
                <span>
                  <strong>Active private label</strong>
                  <code>{activeLabelAssignment.labelId}</code>
                </span>
              </span>
              <button
                type="button"
                className="alp-text-danger"
                onClick={() => deactivateLabel(activeLabelAssignment)}
              >
                <Trash size={17} aria-hidden="true" />
                Deactivate
              </button>
            </div>
          ) : null}

          {createdQr ? (
            <div className="alp-label-preview">
              <div className="alp-qr-frame">
                <img
                  src={createdQr.qrImage}
                  alt={`Scannable QR label assigned to ${createdQr.assetName}`}
                />
              </div>
              <div className="alp-label-meta">
                <span>Opaque label</span>
                <code data-testid="label-id">{createdQr.labelId}</code>
                <p>
                  Asset details are shown beside the code for you; they are not
                  encoded inside it.
                </p>
              </div>
              <div className="alp-inline-actions">
                <a
                  className="alp-secondary-button"
                  href={createdQr.qrImage}
                  download={`heldat-label-${createdQr.labelId}.svg`}
                >
                  <DownloadSimple size={18} aria-hidden="true" />
                  Download SVG
                </a>
                <button
                  className="alp-secondary-button"
                  type="button"
                  onClick={() => copyPayload(createdQr.payload)}
                >
                  <Copy size={18} aria-hidden="true" />
                  Copy payload
                </button>
                <button
                  className="alp-text-danger"
                  type="button"
                  onClick={() =>
                    deactivateLabel(
                      resolveAssetLabel(registry, createdQr.labelId),
                    )
                  }
                >
                  <Trash size={17} aria-hidden="true" />
                  Deactivate label
                </button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="alp-card">
          <div className="alp-step-heading">
            <span className="alp-step-number">02</span>
            <span className="alp-icon alp-icon-cyan">
              <Scan size={22} weight="duotone" aria-hidden="true" />
            </span>
            <div>
              <h3>Read and resolve</h3>
              <p>Confirm the label before showing any private asset data.</p>
            </div>
          </div>

          <label className="alp-upload">
            <UploadSimple size={24} weight="duotone" aria-hidden="true" />
            <span>
              <strong>Upload QR image</strong>
              <small>PNG, JPEG, HEIC when supported · up to 12 MB</small>
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={scanQrImage}
              aria-label="Upload QR label image"
            />
          </label>

          {!qrReaderAvailable ? (
            <p className="alp-fallback-copy">
              Automatic QR image reading needs the browser BarcodeDetector API.
              The manual payload below remains available as a transparent
              fallback.
            </p>
          ) : null}

          <div className="alp-nfc-actions">
            <button
              className="alp-secondary-button"
              type="button"
              onClick={readNfc}
            >
              <Broadcast size={19} weight="duotone" aria-hidden="true" />
              Read NFC tag
            </button>
            <button
              className="alp-secondary-button"
              type="button"
              onClick={writeNfc}
              disabled={!payload}
            >
              <Broadcast size={19} weight="duotone" aria-hidden="true" />
              Write current label
            </button>
          </div>
          <p className="alp-hardware-note">
            Web NFC normally requires HTTPS, Android Chrome, a foreground tab,
            and a user permission prompt.
          </p>
          <StatusMessage status={nfcStatus} />

          <div className="alp-manual-resolve">
            <label className="alp-field">
              <span>Manual opaque payload</span>
              <textarea
                value={manualPayload}
                onChange={(event) => setManualPayload(event.target.value)}
                rows={3}
                spellCheck="false"
                placeholder="alyr:asset-label:v1:…"
                data-testid="label-payload"
              />
            </label>
            <button
              className="alp-secondary-button"
              type="button"
              onClick={() => resolvePayload(manualPayload, "manual")}
              disabled={!manualPayload.trim()}
            >
              Resolve pasted label
            </button>
          </div>
          <StatusMessage status={scanStatus} />
        </article>

        <article className="alp-card alp-move-card">
          <div className="alp-step-heading">
            <span className="alp-step-number">03</span>
            <span className="alp-icon alp-icon-violet">
              <MapPinLine size={22} weight="duotone" aria-hidden="true" />
            </span>
            <div>
              <h3>Confirm destination</h3>
              <p>A stale label context can never silently overwrite a move.</p>
            </div>
          </div>

          {resolvedAsset ? (
            <div className="alp-resolved-asset">
              <span className="alp-resolved-mark">
                <CheckCircle size={19} weight="fill" aria-hidden="true" />
              </span>
              <div>
                <span>Resolved asset</span>
                <strong>{resolvedAsset.name}</strong>
                <small>
                  {displayLocation(resolvedAsset, places, spaces)}
                </small>
              </div>
              <span className="alp-revision">
                Base r{resolvedContext.baseRevision}
              </span>
            </div>
          ) : (
            <div className="alp-empty-resolution">
              <QrCode size={25} weight="duotone" aria-hidden="true" />
              <div>
                <strong>No label resolved yet</strong>
                <span>Create, upload, paste, or tap a label to continue.</span>
              </div>
            </div>
          )}

          <form onSubmit={submitMove} className="alp-move-form">
            <label className="alp-field">
              <span>Destination Place</span>
              <select
                value={destinationPlaceId}
                onChange={(event) => {
                  setDestinationPlaceId(event.target.value);
                  setDestinationSpaceId("");
                  setMoveStatus(null);
                  setMoveConflict(null);
                }}
                disabled={!resolvedAsset}
              >
                <option value="">Choose a Place</option>
                {activePlaces.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="alp-field">
              <span>Room, zone, or container</span>
              <select
                value={destinationSpaceId}
                onChange={(event) =>
                  setDestinationSpaceId(event.target.value)
                }
                disabled={!resolvedAsset || !destinationPlaceId}
              >
                <option value="">Place level only</option>
                {destinationSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {buildSpacePath(space, spaces)}
                  </option>
                ))}
              </select>
            </label>

            <label className="alp-field">
              <span>Exact retrieval detail <em>Optional</em></span>
              <input
                value={destinationDetail}
                onChange={(event) => setDestinationDetail(event.target.value)}
                disabled={!resolvedAsset}
                maxLength={500}
                placeholder="Top shelf · blue archival box"
              />
            </label>

            {moveConflict ? (
              <div className="alp-conflict" role="alert">
                <WarningCircle
                  size={22}
                  weight="fill"
                  aria-hidden="true"
                />
                <div>
                  <strong>Location conflict</strong>
                  <p>{moveConflict.message}</p>
                  <span>
                    Scanned base r{moveConflict.baseRevision} · current{" "}
                    {typeof moveConflict.currentRevision === "number"
                      ? `r${moveConflict.currentRevision}`
                      : moveConflict.currentRevision}
                  </span>
                </div>
                <button
                  className="alp-conflict-refresh"
                  type="button"
                  onClick={refreshMoveContext}
                >
                  <ArrowsClockwise size={17} aria-hidden="true" />
                  Refresh context
                </button>
              </div>
            ) : null}

            <StatusMessage status={moveStatus} />
            <button
              className="alp-primary-button alp-move-button"
              type="submit"
              disabled={!resolvedAsset || !destinationPlaceId}
            >
              Review and move
              <ArrowRight size={19} weight="bold" aria-hidden="true" />
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}

export default AssetLabelPanel;
