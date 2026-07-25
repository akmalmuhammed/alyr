import {
  Archive,
  CheckCircle,
  FileText,
  Images,
  Info,
  MapPin,
  QrCode,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssetLabelPanel } from "./AssetLabelPanel.jsx";
import { resolveAssetLabel } from "./capturePipeline.js";
import { DocumentScanPanel } from "./DocumentScanPanel.jsx";
import { RoomCapturePanel } from "./RoomCapturePanel.jsx";
import {
  LOCAL_DEMO_SCOPE_ID,
  describeEvidenceOriginal,
} from "./fileStore.js";
import "./captureStudio.css";

const TOOLS = [
  {
    id: "document",
    label: "Document scan",
    shortLabel: "Document",
    icon: FileText,
    copy: "Pages, local OCR, and human review",
  },
  {
    id: "room",
    label: "Room photo batch",
    shortLabel: "Room",
    icon: Images,
    copy: "Ordered photos with a recoverable checkpoint",
  },
  {
    id: "labels",
    label: "Asset labels",
    shortLabel: "Labels",
    icon: QrCode,
    copy: "Private QR or NFC keys with safe moves",
  },
];

function createOpaqueId(prefix, requestedId = "") {
  const requested = String(requestedId || "")
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/gu, "-")
    .slice(0, 180);
  if (requested) return `${prefix}-${requested}`;
  const random =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function asFile(blob, fileName, fileType, capturedAt) {
  if (typeof File === "function" && blob instanceof File) return blob;
  return new File([blob], fileName || "capture", {
    type: fileType || blob?.type || "application/octet-stream",
    lastModified: Date.parse(capturedAt || "") || Date.now(),
  });
}

function activeLocationSnapshot(workspace, assetId) {
  const history = (workspace.locationAssignments || [])
    .filter((item) => item.assetId === assetId)
    .sort(
      (left, right) =>
        Date.parse(left.validFrom || left.createdAt || 0) -
        Date.parse(right.validFrom || right.createdAt || 0),
    );
  const current = [...history].reverse().find((item) => !item.validTo) || null;
  if (!current) return { assignment: null, revision: 0 };
  const explicitRevision = Number(current.revision);
  return {
    assignment: current,
    revision:
      Number.isInteger(explicitRevision) && explicitRevision >= 0
        ? explicitRevision
        : history.findIndex((item) => item.id === current.id) + 1,
  };
}

export function resolveActiveLabelAssignmentForMove(workspace, command) {
  const registry =
    workspace?.assetLabelRegistry ||
    workspace?.labelRegistry ||
    workspace?.capture?.labelRegistry;
  if (
    !registry ||
    !command?.labelId ||
    !command?.labelAssignmentId ||
    !command?.assetId
  ) {
    return null;
  }
  try {
    const assignment = resolveAssetLabel(registry, command.labelId);
    if (
      !assignment ||
      assignment.id !== command.labelAssignmentId ||
      assignment.assetId !== command.assetId
    ) {
      return null;
    }
    return assignment;
  } catch {
    return null;
  }
}

function StudioTarget({
  icon: Icon,
  eyebrow,
  title,
  copy,
  children,
}) {
  return (
    <section className="capture-studio-target" aria-labelledby={`${eyebrow}-target-title`}>
      <span className="capture-studio-target-icon">
        <Icon weight="duotone" />
      </span>
      <div className="capture-studio-target-copy">
        <small>{eyebrow}</small>
        <h3 id={`${eyebrow}-target-title`}>{title}</h3>
        <p>{copy}</p>
      </div>
      <div className="capture-studio-target-fields">{children}</div>
    </section>
  );
}

export function CaptureStudioDrawer({
  workspace,
  dispatch,
  commitWorkspaceActionsWithFiles,
  setAnnouncement,
  storageScopeId = LOCAL_DEMO_SCOPE_ID,
  createdBy = null,
  initialTool = "document",
  initialAssetId = null,
  initialPlaceId = null,
  initialSpaceId = null,
  onClose,
}) {
  const drawerRef = useRef(null);
  const activeCreatedBy =
    workspace.members.some(
      (member) =>
        member.id === createdBy && member.inviteStatus === "active",
    )
      ? createdBy
      : null;
  const activeAssets = useMemo(
    () =>
      workspace.assets.filter(
        (asset) => asset.lifecycleStatus !== "archived",
      ),
    [workspace.assets],
  );
  const activePlaces = useMemo(
    () => workspace.places.filter((place) => place.status !== "archived"),
    [workspace.places],
  );
  const requestedTool = TOOLS.some((item) => item.id === initialTool)
    ? initialTool
    : "document";
  const [tool, setTool] = useState(requestedTool);
  const [assetId, setAssetId] = useState(
    activeAssets.some((asset) => asset.id === initialAssetId)
      ? initialAssetId
      : activeAssets[0]?.id || "",
  );
  const [assetQuery, setAssetQuery] = useState("");
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
    const selected = activeAssets.find((asset) => asset.id === assetId);
    return selected && !limited.some((asset) => asset.id === selected.id)
      ? [selected, ...limited].slice(0, 40)
      : limited;
  }, [activeAssets, assetId, assetQuery]);
  const initialSpace = workspace.spaces.find(
    (space) => space.id === initialSpaceId,
  );
  const initialPlace =
    activePlaces.find((place) => place.id === initialPlaceId) ||
    activePlaces.find((place) => place.id === initialSpace?.placeId) ||
    activePlaces.find((place) =>
      workspace.spaces.some((space) => space.placeId === place.id),
    ) ||
    activePlaces[0] ||
    null;
  const [placeId, setPlaceId] = useState(initialPlace?.id || "");
  const roomOptions = useMemo(
    () => workspace.spaces.filter((space) => space.placeId === placeId),
    [placeId, workspace.spaces],
  );
  const [roomId, setRoomId] = useState(
    roomOptions.some((space) => space.id === initialSpaceId)
      ? initialSpaceId
      : roomOptions[0]?.id || "",
  );
  const selectedPlace =
    activePlaces.find((place) => place.id === placeId) || null;
  const selectedRoom =
    workspace.spaces.find(
      (space) => space.id === roomId && space.placeId === placeId,
    ) || null;

  useEffect(() => {
    drawerRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [
        ...drawerRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!roomOptions.some((space) => space.id === roomId)) {
      setRoomId(roomOptions[0]?.id || "");
    }
  }, [roomId, roomOptions]);

  async function commitDocument(payload) {
    const target = workspace.assets.find(
      (asset) =>
        asset.id === assetId && asset.lifecycleStatus !== "archived",
    );
    if (!target) {
      throw new Error("Choose a current asset before attaching this document.");
    }
    const now = payload.committedAt || new Date().toISOString();
    const prepared = await Promise.all(
      payload.files.map(async (file, index) => {
        const evidenceId = createOpaqueId(
          "evidence-document",
          `${payload.draftId}-${index + 1}`,
        );
        const metadata = await describeEvidenceOriginal(
          evidenceId,
          file,
        );
        return {
          evidenceId,
          file,
          metadata,
          page: payload.pages[index],
        };
      }),
    );
    if (typeof commitWorkspaceActionsWithFiles !== "function") {
      throw new Error(
        "Durable capture storage is not ready. The document draft was kept.",
      );
    }
    const actions = prepared.map((item, index) => ({
        type: "ADD_EVIDENCE",
        memberId: activeCreatedBy,
        evidence: {
          id: item.evidenceId,
          assetId: target.id,
          type:
            prepared.length === 1
              ? payload.title
              : `${payload.title} · page ${index + 1}`,
          kind: "paper",
          relation: "supports",
          status: "pending",
          fileName: item.metadata.fileName,
          fileType: item.metadata.fileType,
          fileSize: item.metadata.fileSize,
          fileChecksum: item.metadata.fileChecksum,
          originalVersionId: item.metadata.originalVersionId,
          fileState: "ready_local",
          storageScope: "local-device",
          note:
            index === 0 && payload.text
              ? `Reviewed local text extraction:\n${payload.text}`
              : "",
          addedAt: now,
        },
        now,
      }));
    await commitWorkspaceActionsWithFiles({
      actions,
      files: prepared.map((item) => ({
        evidenceId: item.evidenceId,
        file: item.file,
        expectedCurrentOriginalVersionId: null,
      })),
      operationId: createOpaqueId(
        "document-capture-operation",
        payload.draftId,
      ),
      now,
    });
    setAnnouncement?.(
      `${payload.title} attached to ${target.name} with ${prepared.length} pending ${prepared.length === 1 ? "page" : "pages"}.`,
    );
  }

  async function commitRoom(payload) {
    if (!activeCreatedBy || payload.createdBy !== activeCreatedBy) {
      throw new Error(
        "Room capture is blocked because the active account is not a workspace member.",
      );
    }
    const place = activePlaces.find((item) => item.id === payload.placeId);
    const room = workspace.spaces.find(
      (item) =>
        item.id === payload.roomId && item.placeId === payload.placeId,
    );
    if (!place || !room) {
      throw new Error(
        "The selected Place or room changed. The local checkpoint was kept.",
      );
    }
    const assetIdForSession = createOpaqueId(
      "asset-room-capture",
      payload.commitId,
    );
    const prepared = await Promise.all(
      payload.media.map(async (media, index) => {
        const file = asFile(
          media.blob,
          media.fileName,
          media.mimeType,
          media.capturedAt,
        );
        const evidenceId = createOpaqueId(
          "evidence-room-photo",
          `${payload.commitId}-${media.id || index + 1}`,
        );
        const metadata = await describeEvidenceOriginal(
          evidenceId,
          file,
        );
        return {
          evidenceId,
          file,
          metadata,
          media,
        };
      }),
    );
    if (typeof commitWorkspaceActionsWithFiles !== "function") {
      throw new Error(
        "Durable capture storage is not ready. The room checkpoint was kept.",
      );
    }
    const actions = [{
      type: "ADD_ASSET",
      memberId: activeCreatedBy,
      asset: {
        id: assetIdForSession,
        name: `${room.name} inventory · ${new Date(
          payload.committedAt,
        ).toLocaleDateString()}`,
        category: "Room inventory session",
        categoryId: "custom.other",
        kind: "physical",
        profile: {},
        placeId: place.id,
        spaceId: room.id,
        locationMode: "physical",
        locationStatus: "known",
        locationDetail: room.name,
        locationSource: "user",
        lifecycleStatus: "active",
        meaningFacets: ["inventory-session"],
        visibility: "private",
        notes:
          "Recoverable multi-photo room capture. Review each photo before promoting individual items.",
        requiredProofTypes: [],
        createdAt: payload.committedAt,
      },
      now: payload.committedAt,
    }];
    prepared.forEach((item, index) => {
      actions.push({
        type: "ADD_EVIDENCE",
        memberId: activeCreatedBy,
        evidence: {
          id: item.evidenceId,
          assetId: assetIdForSession,
          type: `Room overview · ${index + 1}`,
          kind: "media",
          relation: "depicts",
          status: "pending",
          fileName: item.metadata.fileName,
          fileType: item.metadata.fileType,
          fileSize: item.metadata.fileSize,
          fileChecksum: item.metadata.fileChecksum,
          originalVersionId: item.metadata.originalVersionId,
          fileState: "ready_local",
          storageScope: "local-device",
          note: "Captured as part of an ordered room inventory session.",
          addedAt: payload.committedAt,
        },
        now: payload.committedAt,
      });
    });
    await commitWorkspaceActionsWithFiles({
      actions,
      files: prepared.map((item) => ({
        evidenceId: item.evidenceId,
        file: item.file,
        expectedCurrentOriginalVersionId: null,
      })),
      operationId: createOpaqueId(
        "room-capture-operation",
        payload.commitId,
      ),
      now: payload.committedAt,
    });
    setAnnouncement?.(
      `${prepared.length} room ${prepared.length === 1 ? "photo" : "photos"} saved for ${room.name}.`,
    );
  }

  async function moveResolvedAsset(command) {
    const activeLabelAssignment = resolveActiveLabelAssignmentForMove(
      workspace,
      command,
    );
    if (!activeLabelAssignment) {
      return {
        kind: "conflict",
        status: "conflict",
        code: "LABEL_ASSIGNMENT_CHANGED",
        message:
          "This label is no longer actively assigned to this asset. Nothing was moved.",
      };
    }
    const current = activeLocationSnapshot(workspace, command.assetId);
    const assignmentChanged =
      (command.expectedAssignmentId || null) !==
        (current.assignment?.id || null) ||
      Number(command.expectedRevision || 0) !== current.revision;
    if (assignmentChanged) {
      return {
        kind: "conflict",
        status: "conflict",
        message:
          "The asset location changed after the label was resolved. Nothing was moved.",
        currentRevision: current.revision,
      };
    }
    dispatch({
      ...command,
      type: "MOVE_ASSET",
      assignmentId: command.assignmentId || command.newAssignmentId,
      confirmationState: "user-confirmed",
      reason: "Moved after resolving a private asset label",
      now: command.proposedAt || new Date().toISOString(),
    });
    const destination = activePlaces.find(
      (place) => place.id === command.placeId,
    );
    setAnnouncement?.(
      `Asset moved to ${destination?.name || "the reviewed destination"}.`,
    );
    return { kind: "apply", status: "saved" };
  }

  return (
    <motion.div
      className="overlay-backdrop drawer-backdrop capture-studio-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <motion.div
        ref={drawerRef}
        tabIndex="-1"
        className="capture-studio-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-studio-title"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
      >
        <div className="capture-studio-shell-header">
          <div>
            <span className="eyebrow">Capture studio</span>
            <h2 id="capture-studio-title">Turn real-world context into a record.</h2>
            <p>
              Originals stay on this device until you deliberately protect or
              transfer them. Extracted text and detected labels always require
              review.
            </p>
          </div>
          <button
            type="button"
            className="capture-studio-close"
            aria-label="Close capture studio"
            onClick={onClose}
          >
            <X weight="bold" />
          </button>
        </div>

        <nav className="capture-studio-tabs" aria-label="Capture studio tools">
          {TOOLS.map(({ id, label, shortLabel, icon: Icon, copy }) => (
            <button
              key={id}
              type="button"
              className={tool === id ? "is-active" : ""}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
            >
              <span><Icon weight="duotone" /></span>
              <span>
                <strong>{label}</strong>
                <small>{copy}</small>
              </span>
              <em>{shortLabel}</em>
            </button>
          ))}
        </nav>

        <div className="capture-studio-workspace">
          {tool === "document" && (
            <>
              <StudioTarget
                icon={Archive}
                eyebrow="Attach to"
                title="Choose the Asset Passport"
                copy="A document is supporting material. It stays connected to one asset instead of becoming an orphaned file."
              >
                <label>
                  <span>Find asset</span>
                  <input
                    type="search"
                    value={assetQuery}
                    onChange={(event) => setAssetQuery(event.target.value)}
                    placeholder="Name, category, reference, or location"
                  />
                </label>
                <label>
                  <span>Asset</span>
                  <select
                    value={assetId}
                    onChange={(event) => setAssetId(event.target.value)}
                  >
                    <option value="">Choose an asset</option>
                    {visibleAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </label>
              </StudioTarget>
              {assetId ? (
                <DocumentScanPanel
                  key={assetId}
                  assetId={assetId}
                  householdId={workspace.household.id}
                  draftKey={`asset:${assetId}:document-studio`}
                  storageScopeId={storageScopeId}
                  onCommit={commitDocument}
                />
              ) : (
                <div className="capture-studio-empty">
                  <FileText weight="duotone" />
                  <h3>Add or choose an asset first</h3>
                  <p>
                    This keeps the document findable and prevents unattached
                    private files.
                  </p>
                </div>
              )}
            </>
          )}

          {tool === "room" && (
            <>
              <StudioTarget
                icon={MapPin}
                eyebrow="Capture inside"
                title="Choose a specific room or zone"
                copy="The Place identifies the property; the nested room or container provides the indoor retrieval path."
              >
                <label>
                  <span>Place</span>
                  <select
                    value={placeId}
                    onChange={(event) => setPlaceId(event.target.value)}
                  >
                    <option value="">Choose a Place</option>
                    {activePlaces.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Room or zone</span>
                  <select
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value)}
                    disabled={!placeId || !roomOptions.length}
                  >
                    <option value="">Choose a room or zone</option>
                    {roomOptions.map((space) => (
                      <option key={space.id} value={space.id}>
                        {space.name}
                      </option>
                    ))}
                  </select>
                </label>
              </StudioTarget>
              {selectedPlace && selectedRoom ? (
                activeCreatedBy ? (
                  <RoomCapturePanel
                    key={`${selectedPlace.id}:${selectedRoom.id}:${activeCreatedBy}`}
                    householdId={workspace.household.id}
                    createdBy={activeCreatedBy}
                    placeId={selectedPlace.id}
                    placeName={selectedPlace.name}
                    roomId={selectedRoom.id}
                    roomName={selectedRoom.name}
                    onCommit={commitRoom}
                    onClose={onClose}
                  />
                ) : (
                  <div className="capture-studio-empty" role="alert">
                    <ShieldCheck weight="duotone" />
                    <h3>Active workspace membership required</h3>
                    <p>
                      This signed-in account cannot create room records for
                      another member.
                    </p>
                  </div>
                )
              ) : (
                <div className="capture-studio-empty">
                  <Images weight="duotone" />
                  <h3>Create and choose a room first</h3>
                  <p>
                    A room batch needs a specific Place and room or zone so every
                    photo has a durable retrieval path.
                  </p>
                </div>
              )}
            </>
          )}

          {tool === "labels" && (
            <AssetLabelPanel
              workspace={workspace}
              assets={workspace.assets}
              places={workspace.places}
              spaces={workspace.spaces}
              onMove={moveResolvedAsset}
              onLabelRegistryChange={(registry) => {
                dispatch({
                  type: "SET_ASSET_LABEL_REGISTRY",
                  registry,
                  now: new Date().toISOString(),
                });
                setAnnouncement?.(
                  "Private asset-label assignment saved in this workspace.",
                );
              }}
            />
          )}
        </div>

        <footer className="capture-studio-shell-footer">
          <span><ShieldCheck weight="duotone" /></span>
          <div>
            <strong>Human-confirmed by design</strong>
            <small>
              OCR suggestions, room photos, and label moves never become proof
              of ownership, authenticity, value, or legal accuracy.
            </small>
          </div>
          <Info weight="bold" />
        </footer>
      </motion.div>
    </motion.div>
  );
}

export default CaptureStudioDrawer;
