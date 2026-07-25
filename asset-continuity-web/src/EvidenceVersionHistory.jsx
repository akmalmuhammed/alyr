import { useEffect, useId, useState } from "react";
import {
  CheckCircle,
  ClockCounterClockwise,
  DownloadSimple,
  WarningCircle,
} from "@phosphor-icons/react";

import {
  getEvidenceOriginalVersion,
  listEvidenceOriginalVersions,
} from "./fileStore.js";

function formatSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

function formatStoredAt(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function shortVersion(value) {
  const version = String(value || "");
  return version.startsWith("ov_")
    ? `${version.slice(3, 11)}…${version.slice(-6)}`
    : version || "Unknown";
}

function downloadRecord(record, evidenceId) {
  if (!record?.blob) {
    throw new Error("The selected original version is not available.");
  }
  const objectUrl = URL.createObjectURL(record.blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download =
    record.fileName ||
    `original-${evidenceId}-${shortVersion(record.originalVersionId)}.bin`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export default function EvidenceVersionHistory({
  evidenceId,
  scopeId,
  currentOriginalVersionId,
}) {
  const headingId = useId();
  const [versions, setVersions] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError("");
    listEvidenceOriginalVersions(evidenceId, { scopeId })
      .then((result) => {
        if (!active) return;
        setVersions(result);
        setStatus("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setVersions([]);
        setStatus("error");
        setError(
          cause?.message ||
            "Original version history could not be opened on this device.",
        );
      });
    return () => {
      active = false;
    };
  }, [currentOriginalVersionId, evidenceId, scopeId]);

  async function downloadVersion(version) {
    if (downloadingId) return;
    setDownloadingId(version.originalVersionId);
    setError("");
    try {
      const record = await getEvidenceOriginalVersion(
        evidenceId,
        version.originalVersionId,
        { scopeId },
      );
      downloadRecord(record, evidenceId);
    } catch (cause) {
      setError(
        cause?.message ||
          "That original version could not be verified for download.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  if (status === "ready" && versions.length < 1) return null;

  return (
    <section
      className="evidence-version-history"
      aria-labelledby={headingId}
    >
      <header>
        <span>
          <ClockCounterClockwise weight="duotone" aria-hidden="true" />
        </span>
        <div>
          <span className="eyebrow">Immutable originals</span>
          <h2 id={headingId}>Source version history</h2>
          <p>
            Replacing a file changes the current pointer. Earlier original bytes
            remain separately retrievable on this device.
          </p>
        </div>
      </header>

      {status === "loading" && (
        <p className="evidence-version-status" role="status">
          Reading verified local versions…
        </p>
      )}

      {status === "error" && (
        <p className="evidence-version-error" role="alert">
          <WarningCircle weight="fill" aria-hidden="true" />
          {error}
        </p>
      )}

      {status === "ready" && (
        <div className="evidence-version-list">
          {versions.map((version, index) => (
            <article
              key={version.originalVersionId}
              className={version.isCurrent ? "is-current" : ""}
            >
              <div className="evidence-version-sequence" aria-hidden="true">
                {version.isCurrent ? (
                  <CheckCircle weight="fill" />
                ) : (
                  <span>{versions.length - index}</span>
                )}
              </div>
              <div className="evidence-version-copy">
                <span>
                  <strong>
                    {version.isCurrent ? "Current original" : "Prior original"}
                  </strong>
                  {version.isCurrent && <em>In use</em>}
                </span>
                <p>{version.fileName || "Unnamed original"}</p>
                <small>
                  {formatStoredAt(version.storedAt)} ·{" "}
                  {formatSize(version.fileSize)}
                </small>
                <code title={version.originalVersionId}>
                  {shortVersion(version.originalVersionId)}
                </code>
              </div>
              <button
                type="button"
                onClick={() => downloadVersion(version)}
                disabled={Boolean(downloadingId)}
                aria-label={`Download ${
                  version.isCurrent ? "current" : "prior"
                } original ${version.fileName || ""}`.trim()}
              >
                <DownloadSimple weight="bold" aria-hidden="true" />
                {downloadingId === version.originalVersionId
                  ? "Verifying…"
                  : "Download"}
              </button>
            </article>
          ))}
        </div>
      )}

      {error && status === "ready" && (
        <p className="evidence-version-error" role="alert">
          <WarningCircle weight="fill" aria-hidden="true" />
          {error}
        </p>
      )}
    </section>
  );
}

