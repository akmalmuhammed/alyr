import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  CloudSlash,
  HardDrive,
  Images,
  MapPinLine,
  Pause,
  Play,
  SpinnerGap,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  appendRoomCaptureMedia,
  commitRoomCaptureSession,
  createRoomCaptureSession,
  markRoomCaptureReady,
  pauseRoomCaptureSession,
  removeRoomCaptureMedia,
  reorderRoomCaptureMedia,
  resumeRoomCaptureSession,
} from "./capturePipeline.js";
import {
  createRoomCaptureCommitPayload,
  createRoomCaptureLocalRef,
  createRoomCaptureSessionId,
  roomCaptureStore,
} from "./roomCaptureStore.js";
import "./roomCapture.css";

function defaultClock() {
  return new Date().toISOString();
}

function defaultId(prefix) {
  const random =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function friendlyError(error) {
  return (
    error?.message ||
    "That room capture action could not be completed. Your saved checkpoint was kept."
  );
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(
    value < 10 * 1024 * 1024 ? 1 : 0,
  )} MB`;
}

function statusCopy(status) {
  switch (status) {
    case "capturing":
      return "Capturing";
    case "paused":
      return "Paused · checkpoint saved";
    case "ready":
      return "Ready to save";
    case "committed":
      return "Save delivery pending";
    default:
      return "Ready to capture";
  }
}

function CaptureInput({
  kind,
  disabled,
  roomName,
  onFiles,
}) {
  const isCamera = kind === "camera";
  const label = isCamera ? "Take photo" : "Choose photos";
  const Icon = isCamera ? Camera : Images;

  return (
    <label
      className={`room-capture-input ${disabled ? "is-disabled" : ""}`}
    >
      <Icon weight="duotone" aria-hidden="true" />
      <span>{label}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={isCamera ? "environment" : undefined}
        multiple={!isCamera}
        disabled={disabled}
        aria-label={`${label} for ${roomName}`}
        onChange={onFiles}
      />
    </label>
  );
}

export function RoomCapturePanel({
  householdId,
  createdBy,
  placeId,
  placeName,
  roomId,
  roomName,
  sessionId = null,
  onCommit,
  onClose,
  onDiscard,
  storage = roomCaptureStore,
  clock = defaultClock,
  createId = defaultId,
}) {
  const [session, setSession] = useState(null);
  const [files, setFiles] = useState([]);
  const [checkpointAt, setCheckpointAt] = useState(null);
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [recovered, setRecovered] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [discardArmed, setDiscardArmed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [previewUrls, setPreviewUrls] = useState(new Map());
  const mountedRef = useRef(true);

  const contextLabel = `${placeName || "Place"} · ${roomName || "Room"}`;
  const totalBytes = useMemo(
    () => session?.media.reduce(
      (sum, media) => sum + (Number(media.byteSize) || 0),
      0,
    ) || 0,
    [session],
  );
  const fileByMediaId = useMemo(
    () => new Map(files.map((file) => [file.mediaId, file])),
    [files],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const urls = new Map();
    for (const file of files) {
      if (file.blob && typeof URL.createObjectURL === "function") {
        urls.set(file.mediaId, URL.createObjectURL(file.blob));
      }
    }
    setPreviewUrls(urls);
    return () => {
      if (typeof URL.revokeObjectURL !== "function") return;
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, [files]);

  useEffect(() => {
    let cancelled = false;

    async function openCapture() {
      setPhase("loading");
      setError("");
      setRecovered(false);
      setDiscardArmed(false);
      try {
        if (!storage?.isAvailable?.()) {
          throw new Error(
            "Durable on-device storage is unavailable in this browser. Room capture has not started.",
          );
        }
        const effectiveSessionId =
          sessionId ||
          createRoomCaptureSessionId({
            householdId,
            placeId,
            spaceId: roomId,
            createdBy,
          });
        const expectedContext = {
          householdId,
          placeId,
          spaceId: roomId,
          createdBy,
        };
        const saved = await storage.loadSession(
          effectiveSessionId,
          expectedContext,
        );
        if (cancelled) return;
        if (saved) {
          setSession(saved.session);
          setFiles(saved.files);
          setCheckpointAt(saved.checkpointAt);
          setRecovered(saved.session.media.length > 0);
          setPhase("ready");
          return;
        }
        const createdAt = clock();
        const nextSession = createRoomCaptureSession({
          id: effectiveSessionId,
          householdId,
          placeId,
          spaceId: roomId,
          createdBy,
          createdAt,
        });
        const checkpoint = await storage.saveCheckpoint(
          nextSession,
          createdAt,
        );
        if (cancelled) return;
        setSession(nextSession);
        setFiles([]);
        setCheckpointAt(checkpoint.checkpointAt);
        setPhase("ready");
      } catch (openError) {
        if (cancelled) return;
        setSession(null);
        setFiles([]);
        setError(friendlyError(openError));
        setPhase("load-error");
      }
    }

    openCapture();
    return () => {
      cancelled = true;
    };
  }, [
    createdBy,
    clock,
    householdId,
    placeId,
    retryNonce,
    roomId,
    sessionId,
    storage,
  ]);

  const orderedFiles = useMemo(
    () =>
      (session?.media || []).map((media) => ({
        media,
        stored: fileByMediaId.get(media.id) || null,
        previewUrl: previewUrls.get(media.id) || "",
      })),
    [fileByMediaId, previewUrls, session],
  );

  const persistCheckpoint = useCallback(
    async (nextSession, at) => {
      const checkpoint = await storage.saveCheckpoint(nextSession, at);
      if (mountedRef.current) {
        setSession(nextSession);
        setCheckpointAt(checkpoint.checkpointAt);
      }
      return checkpoint;
    },
    [storage],
  );

  async function addFiles(event) {
    const input = event.currentTarget;
    const selected = [...(input.files || [])];
    if (!selected.length || !session) {
      input.value = "";
      return;
    }
    if (!["draft", "capturing"].includes(session.status)) {
      setError(
        session.status === "paused"
          ? "Resume this room before adding more photos."
          : "This room batch is already locked for saving.",
      );
      input.value = "";
      return;
    }
    setPhase("adding");
    setError("");
    try {
      const captures = [];
      let nextSession = session;
      for (const file of selected) {
        const description = await storage.describeFile(file);
        const mediaId = createId("room-photo");
        const capturedAt = clock();
        nextSession = appendRoomCaptureMedia(
          nextSession,
          {
            id: mediaId,
            localRef: createRoomCaptureLocalRef(session.id, mediaId),
            kind: "photo",
            mimeType: description.mimeType,
            checksum: description.checksum,
            byteSize: description.byteSize,
            source: input.hasAttribute("capture")
              ? "camera"
              : "file-picker",
            capturedAt,
          },
          capturedAt,
        );
        captures.push({
          mediaId,
          file,
          description,
        });
      }
      const result = await storage.addMedia(
        nextSession,
        captures,
        clock(),
      );
      if (!mountedRef.current) return;
      setSession(nextSession);
      setFiles((current) => [...current, ...result.files]);
      setCheckpointAt(result.checkpoint.checkpointAt);
      setRecovered(false);
      setPhase("ready");
    } catch (addError) {
      if (!mountedRef.current) return;
      setError(friendlyError(addError));
      setPhase("ready");
    } finally {
      input.value = "";
    }
  }

  async function reorder(mediaId, direction) {
    if (!session || session.status !== "capturing") return;
    const ids = session.media.map((media) => media.id);
    const from = ids.indexOf(mediaId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setPhase("saving");
    setError("");
    try {
      const at = clock();
      const nextSession = reorderRoomCaptureMedia(session, ids, at);
      await persistCheckpoint(nextSession, at);
    } catch (reorderError) {
      setError(friendlyError(reorderError));
    } finally {
      if (mountedRef.current) setPhase("ready");
    }
  }

  async function remove(mediaId) {
    if (!session || session.status !== "capturing") return;
    setPhase("saving");
    setError("");
    try {
      const at = clock();
      const nextSession = removeRoomCaptureMedia(session, mediaId, at);
      const checkpoint = await storage.removeMedia(
        nextSession,
        mediaId,
        at,
      );
      if (!mountedRef.current) return;
      setSession(nextSession);
      setFiles((current) =>
        current.filter((file) => file.mediaId !== mediaId),
      );
      setCheckpointAt(checkpoint.checkpointAt);
    } catch (removeError) {
      setError(friendlyError(removeError));
    } finally {
      if (mountedRef.current) setPhase("ready");
    }
  }

  async function pauseOrResume() {
    if (!session) return;
    setPhase("saving");
    setError("");
    try {
      const at = clock();
      const nextSession =
        session.status === "paused"
          ? resumeRoomCaptureSession(session, at)
          : pauseRoomCaptureSession(session, at);
      await persistCheckpoint(nextSession, at);
    } catch (pauseError) {
      setError(friendlyError(pauseError));
    } finally {
      if (mountedRef.current) setPhase("ready");
    }
  }

  async function deliverCommitted(nextSession, recoveredFiles) {
    if (typeof onCommit !== "function") {
      throw new Error(
        "This room capture needs a save destination before it can finish.",
      );
    }
    const payload = createRoomCaptureCommitPayload(
      nextSession,
      recoveredFiles,
    );
    await onCommit(payload);
    await storage.clearSession(nextSession.id);
    if (!mountedRef.current) return;
    setCompletedCount(nextSession.media.length);
    setFiles([]);
    setCheckpointAt(null);
    setPhase("completed");
  }

  async function finish() {
    if (!session) return;
    if (!session.media.length) {
      setError(
        "Add at least one room photo before finishing this batch.",
      );
      return;
    }
    if (typeof onCommit !== "function") {
      setError(
        "This room capture needs a save destination before it can finish.",
      );
      return;
    }
    setPhase("committing");
    setError("");
    let nextSession = session;
    try {
      if (nextSession.status !== "committed") {
        const readyAt = clock();
        if (nextSession.status !== "ready") {
          nextSession = markRoomCaptureReady(nextSession, readyAt);
          await persistCheckpoint(nextSession, readyAt);
        }
        const committedAt = clock();
        nextSession = commitRoomCaptureSession(nextSession, {
          commitId: createId("room-commit"),
          committedAt,
        });
        await persistCheckpoint(nextSession, committedAt);
      }
      const recoveredSession = await storage.loadSession(nextSession.id, {
        householdId,
        placeId,
        spaceId: roomId,
        createdBy,
      });
      if (!recoveredSession) {
        throw new Error(
          "The saved room checkpoint could not be reopened for final verification.",
        );
      }
      await deliverCommitted(nextSession, recoveredSession.files);
    } catch (commitError) {
      if (!mountedRef.current) return;
      setError(
        nextSession.status === "committed" ||
          String(commitError?.code || "").startsWith("COMMIT")
          ? `${friendlyError(commitError)} The local originals and commit identity were kept for a safe retry.`
          : friendlyError(commitError),
      );
      setPhase("ready");
    }
  }

  async function discard() {
    if (!session) return;
    setPhase("discarding");
    setError("");
    try {
      await storage.clearSession(session.id);
      if (!mountedRef.current) return;
      setFiles([]);
      setSession(null);
      setCheckpointAt(null);
      setDiscardArmed(false);
      setPhase("discarded");
      onDiscard?.({ sessionId: session.id, placeId, roomId });
    } catch (discardError) {
      if (!mountedRef.current) return;
      setError(friendlyError(discardError));
      setPhase("ready");
    }
  }

  if (phase === "loading") {
    return (
      <section
        className="room-capture-panel is-loading"
        aria-label={`Room capture for ${contextLabel}`}
        aria-live="polite"
      >
        <SpinnerGap className="room-capture-spinner" aria-hidden="true" />
        <div>
          <strong>Opening the local checkpoint</strong>
          <span>No camera or file picker has opened yet.</span>
        </div>
      </section>
    );
  }

  if (phase === "load-error") {
    return (
      <section
        className="room-capture-panel is-error"
        aria-labelledby="room-capture-error-title"
      >
        <WarningCircle weight="duotone" aria-hidden="true" />
        <div>
          <span className="room-capture-kicker">Capture not started</span>
          <h2 id="room-capture-error-title">
            This room could not open safely
          </h2>
          <p role="alert">{error}</p>
          <div className="room-capture-inline-actions">
            <button
              type="button"
              className="room-capture-button is-secondary"
              onClick={() => setRetryNonce((value) => value + 1)}
            >
              Try again
            </button>
            {onClose && (
              <button
                type="button"
                className="room-capture-text-button"
                onClick={onClose}
              >
                Close
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (phase === "completed") {
    return (
      <section
        className="room-capture-panel is-complete"
        aria-labelledby="room-capture-complete-title"
        aria-live="polite"
      >
        <span className="room-capture-complete-mark">
          <Check weight="bold" aria-hidden="true" />
        </span>
        <div>
          <span className="room-capture-kicker">Batch handed off</span>
          <h2 id="room-capture-complete-title">
            {completedCount} {completedCount === 1 ? "photo" : "photos"} kept
            in order
          </h2>
          <p>
            The temporary room checkpoint and its duplicate local copies were
            cleaned up after the destination accepted them.
          </p>
          {onClose && (
            <button
              type="button"
              className="room-capture-button is-primary"
              onClick={onClose}
            >
              Done
            </button>
          )}
        </div>
      </section>
    );
  }

  if (phase === "discarded") {
    return (
      <section
        className="room-capture-panel is-complete"
        aria-live="polite"
      >
        <span className="room-capture-complete-mark is-muted">
          <Trash weight="duotone" aria-hidden="true" />
        </span>
        <div>
          <span className="room-capture-kicker">Local draft removed</span>
          <h2>Room capture discarded</h2>
          <p>
            The checkpoint and temporary photo originals were deleted from
            this browser.
          </p>
          {onClose && (
            <button
              type="button"
              className="room-capture-button is-secondary"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </section>
    );
  }

  const busy = !["ready", "load-error"].includes(phase);
  const paused = session?.status === "paused";
  const locked = ["ready", "committed"].includes(session?.status);
  const canEdit = session?.status === "capturing" && !busy;
  const hasMedia = Boolean(session?.media.length);

  return (
    <section
      className="room-capture-panel"
      aria-labelledby="room-capture-title"
      aria-busy={busy}
    >
      <header className="room-capture-header">
        <div className="room-capture-heading">
          <span className="room-capture-kicker">Room batch</span>
          <h2 id="room-capture-title">
            Photograph the room once. Sort it later.
          </h2>
          <div className="room-capture-context">
            <MapPinLine weight="duotone" aria-hidden="true" />
            <span>{placeName || placeId}</span>
            <span aria-hidden="true">/</span>
            <strong>{roomName || roomId}</strong>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className="room-capture-close"
            aria-label="Close room capture and keep local checkpoint"
            onClick={onClose}
            disabled={busy}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="room-capture-boundary" role="status">
        <span className="room-capture-boundary-icon">
          <CloudSlash weight="duotone" aria-hidden="true" />
        </span>
        <div>
          <strong>Only on this device</strong>
          <span>
            Originals and a recoverable checkpoint use this browser’s local
            storage. No cloud backup or cross-device upload is running, and
            clearing browser data can remove them.
          </span>
        </div>
        <span className="room-capture-storage-chip">
          <HardDrive aria-hidden="true" />
          Local
        </span>
      </div>

      {recovered && (
        <div className="room-capture-recovered" role="status">
          <Check weight="bold" aria-hidden="true" />
          <span>
            Recovered {session.media.length} saved{" "}
            {session.media.length === 1 ? "photo" : "photos"} from this device.
          </span>
        </div>
      )}

      <div className="room-capture-meter">
        <div>
          <span className={`room-capture-status is-${session?.status}`}>
            {statusCopy(session?.status)}
          </span>
          <span>
            {session?.media.length || 0}{" "}
            {session?.media.length === 1 ? "original" : "originals"} ·{" "}
            {formatBytes(totalBytes)}
          </span>
        </div>
        <p>
          Start at the doorway, move clockwise, and include drawers or shelves
          you will want to identify later.
        </p>
      </div>

      {!hasMedia ? (
        <div className="room-capture-empty">
          <div className="room-capture-contact-sheet" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <Camera weight="duotone" />
          </div>
          <div>
            <strong>Build a visual memory of this room</strong>
            <p>
              Add a wide view first, then details. Files are copied into a
              recoverable local draft as they arrive.
            </p>
          </div>
        </div>
      ) : (
        <ol
          className="room-capture-grid"
          aria-label="Room photos in saved order"
        >
          {orderedFiles.map(({ media, stored, previewUrl }, index) => (
            <li
              key={media.id}
              className="room-capture-frame"
              data-testid={`room-capture-item-${media.id}`}
            >
              <div className="room-capture-thumbnail">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={`Room photo ${index + 1}: ${
                      stored?.fileName || "local original"
                    }`}
                  />
                ) : (
                  <Images weight="duotone" aria-hidden="true" />
                )}
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="room-capture-frame-meta">
                <div>
                  <strong>{stored?.fileName || `Room photo ${index + 1}`}</strong>
                  <span>
                    {formatBytes(media.byteSize)} · checksum saved
                  </span>
                </div>
                <div className="room-capture-order-actions">
                  <button
                    type="button"
                    aria-label={`Move ${
                      stored?.fileName || `photo ${index + 1}`
                    } earlier`}
                    disabled={!canEdit || index === 0}
                    onClick={() => reorder(media.id, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${
                      stored?.fileName || `photo ${index + 1}`
                    } later`}
                    disabled={!canEdit || index === orderedFiles.length - 1}
                    onClick={() => reorder(media.id, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="is-remove"
                    aria-label={`Remove ${
                      stored?.fileName || `photo ${index + 1}`
                    } from this room batch`}
                    disabled={!canEdit}
                    onClick={() => remove(media.id)}
                  >
                    <Trash aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="room-capture-actions">
        <div className="room-capture-pickers">
          <CaptureInput
            kind="camera"
            roomName={roomName || roomId}
            disabled={busy || paused || locked}
            onFiles={addFiles}
          />
          <CaptureInput
            kind="library"
            roomName={roomName || roomId}
            disabled={busy || paused || locked}
            onFiles={addFiles}
          />
        </div>
        {hasMedia && !locked && (
          <button
            type="button"
            className="room-capture-button is-secondary"
            onClick={pauseOrResume}
            disabled={busy}
          >
            {paused ? (
              <>
                <Play weight="bold" aria-hidden="true" /> Resume
              </>
            ) : (
              <>
                <Pause weight="bold" aria-hidden="true" /> Pause
              </>
            )}
          </button>
        )}
      </div>

      {checkpointAt && (
        <p className="room-capture-checkpoint">
          <HardDrive aria-hidden="true" />
          Checkpoint saved{" "}
          <time dateTime={checkpointAt}>
            {new Date(checkpointAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </p>
      )}

      {error && (
        <div className="room-capture-error" role="alert">
          <WarningCircle weight="fill" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <footer className="room-capture-footer">
        <div>
          <strong>
            {session?.status === "committed"
              ? "The commit identity is safe for a retry."
              : "Review the sequence before finishing."}
          </strong>
          <span>
            Finishing hands the verified originals to the current save
            workflow. It does not upload them by itself.
          </span>
        </div>
        <button
          type="button"
          className="room-capture-button is-primary"
          onClick={finish}
          disabled={busy}
        >
          {phase === "committing" ? (
            <>
              <SpinnerGap className="room-capture-spinner" aria-hidden="true" />
              Verifying
            </>
          ) : session?.status === "committed" ? (
            "Retry save"
          ) : (
            "Finish room"
          )}
        </button>
      </footer>

      {hasMedia && (
        <div className="room-capture-discard">
          {discardArmed ? (
            <>
              <span>
                Delete this checkpoint and all temporary photo originals from
                this browser?
              </span>
              <div>
                <button
                  type="button"
                  className="room-capture-text-button"
                  onClick={() => setDiscardArmed(false)}
                  disabled={busy}
                >
                  Keep draft
                </button>
                <button
                  type="button"
                  className="room-capture-text-button is-danger"
                  onClick={discard}
                  disabled={busy}
                >
                  Discard local copies
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="room-capture-text-button is-danger"
              onClick={() => setDiscardArmed(true)}
              disabled={busy}
            >
              Discard batch
            </button>
          )}
        </div>
      )}
    </section>
  );
}
