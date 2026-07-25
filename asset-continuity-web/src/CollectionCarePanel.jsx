import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  Cube,
  FileText,
  Heart,
  LinkSimple,
  Plus,
  ShieldCheck,
  Sparkle,
  Warning,
  Wrench,
  X,
} from "@phosphor-icons/react";
import {
  selectCollectionCompletion,
  selectCollectionGaps,
  selectCollectionHealth,
  selectCollectionPrideSummary,
} from "./collectorDomain.js";
import "./collectionCare.css";

const DIMENSION_LABELS = {
  identity: "Identity",
  visual: "Photographs",
  edition: "Edition or variant",
  provenance: "Provenance",
  condition: "Condition",
  care: "Service & care",
  story: "Story",
  art: "Art details",
  valuation: "Private valuation",
};

const HEALTH_COPY = {
  empty: {
    label: "Waiting for its first piece",
    copy: "Add a piece before creating a care rhythm.",
  },
  healthy: {
    label: "Care is current",
    copy: "Nothing urgent is due. Keep adding knowledge when it becomes useful.",
  },
  attention: {
    label: "A few records need attention",
    copy: "These are documentation and review prompts—not a judgment on the collection.",
  },
  "needs-care": {
    label: "Care action is due",
    copy: "One or more pieces have a condition or service action worth handling.",
  },
};

function makeId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}-${id}`;
}

function dateToIso(value) {
  return value ? `${value}T12:00:00.000Z` : null;
}

function dateLabel(value) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function activeProfiles(collector, collectionId) {
  const profiles = new Map(
    collector.itemProfiles.map((profile) => [profile.id, profile]),
  );
  return collector.memberships
    .filter(
      (membership) =>
        membership.collectionId === collectionId &&
        membership.status === "active" &&
        membership.role === "owned",
    )
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((membership) => profiles.get(membership.itemProfileId))
    .filter(Boolean);
}

function latestFor(records, profileId, dateField) {
  return records
    .filter((record) => record.itemProfileId === profileId)
    .sort((left, right) =>
      String(right[dateField]).localeCompare(String(left[dateField])),
    )[0];
}

function healthTone(status) {
  if (status === "needs-care") return "urgent";
  if (status === "attention") return "attention";
  if (status === "healthy") return "healthy";
  return "empty";
}

function useCollectorDialogFocus(dialogRef, onClose) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previouslyFocused = document.activeElement;
    const selector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[href]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const focusable = () =>
      [...dialog.querySelectorAll(selector)].filter(
        (element) =>
          !element.hidden &&
          element.getAttribute("aria-hidden") !== "true" &&
          element.getClientRects().length > 0,
      );

    const firstControl = focusable()[0];
    (firstControl || dialog).focus({ preventScroll: true });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const controls = focusable();
      if (!controls.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [dialogRef, onClose]);
}

function alertAction(alert, profile, onOpen, onAddMaterial) {
  if (["condition", "condition-review"].includes(alert.kind)) {
    return (
      <button
        type="button"
        onClick={() => onOpen("condition", { profileId: profile?.id })}
      >
        Add condition check <ArrowRight />
      </button>
    );
  }
  if (["service", "service-history"].includes(alert.kind)) {
    return (
      <button
        type="button"
        onClick={() => onOpen("service", { profileId: profile?.id })}
      >
        Add service record <ArrowRight />
      </button>
    );
  }
  if (alert.kind === "provenance" && profile) {
    return (
      <button type="button" onClick={() => onAddMaterial?.(profile.assetId)}>
        Attach provenance <ArrowRight />
      </button>
    );
  }
  return null;
}

function ProgressRing({ value, label }) {
  const safeValue = Math.max(0, Math.min(100, value || 0));
  return (
    <div
      className="collector-progress-ring"
      role="img"
      aria-label={`${label}: ${safeValue}%`}
      style={{ "--collector-progress": `${safeValue * 3.6}deg` }}
    >
      <span>{safeValue}</span>
      <small>%</small>
    </div>
  );
}

export function CollectionCarePanel({
  collector,
  collectionId,
  assets,
  onCommands,
  onAddMaterial,
  onAnnounce,
}) {
  const [dialog, setDialog] = useState(null);
  const asOf = new Date().toISOString();
  const completion = useMemo(
    () => selectCollectionCompletion(collector, collectionId),
    [collector, collectionId],
  );
  const health = useMemo(
    () => selectCollectionHealth(collector, collectionId, { asOf }),
    [collector, collectionId, asOf],
  );
  const gaps = useMemo(
    () => selectCollectionGaps(collector, collectionId),
    [collector, collectionId],
  );
  const pride = useMemo(
    () => selectCollectionPrideSummary(collector, collectionId),
    [collector, collectionId],
  );
  const profiles = useMemo(
    () => activeProfiles(collector, collectionId),
    [collector, collectionId],
  );
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const healthMessage = HEALTH_COPY[health?.status] || HEALTH_COPY.empty;

  function openDialog(kind, context = {}) {
    setDialog({ kind, ...context });
  }

  function saveCommands(commands, message) {
    onCommands(commands);
    setDialog(null);
    onAnnounce?.(message);
  }

  if (!health || !completion || !gaps || !pride) {
    return (
      <section className="collector-care-empty">
        <Archive weight="duotone" />
        <h2>Collector care is getting ready</h2>
        <p>Add a piece to connect condition, service, provenance, and plans.</p>
      </section>
    );
  }

  return (
    <div className="collector-care-workspace">
      <section
        className={`collector-health-hero is-${healthTone(health.status)}`}
      >
        <div className="collector-health-copy">
          <span className="eyebrow">Private conservation ledger</span>
          <h2>{healthMessage.label}</h2>
          <p>{healthMessage.copy}</p>
          <div className="collector-health-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!profiles.length}
              onClick={() => openDialog("condition")}
            >
              <Plus weight="bold" /> Add care record
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => openDialog("target")}
            >
              Define a collection gap
            </button>
          </div>
        </div>
        <div className="collector-health-score">
          <ProgressRing value={health.score} label="Collection health" />
          <div>
            <strong>Collection health</strong>
            <small>
              Derived from dated care and documentation—not rarity, price, or
              prestige.
            </small>
          </div>
        </div>
        <dl className="collector-health-facts">
          <div>
            <dt>Due now</dt>
            <dd>{health.alerts.length}</dd>
          </div>
          <div>
            <dt>Documented</dt>
            <dd>{completion.itemPercent}%</dd>
          </div>
          <div>
            <dt>Stories kept</dt>
            <dd>{pride.storyCount}</dd>
          </div>
          <div>
            <dt>Open gaps</dt>
            <dd>{gaps.openTargetCount + gaps.openWishlistCount}</dd>
          </div>
        </dl>
      </section>

      <div className="collector-care-columns">
        <section className="collector-care-section collector-attention-section">
          <div className="collector-section-heading">
            <div>
              <span className="eyebrow">What deserves attention</span>
              <h2>{health.alerts.length ? "A calm, useful queue" : "Nothing urgent"}</h2>
            </div>
            <ShieldCheck weight="duotone" />
          </div>
          {health.alerts.length ? (
            <div className="collector-alert-list">
              {health.alerts.slice(0, 8).map((alert, index) => {
                const profile = profileById.get(alert.itemProfileId);
                return (
                  <article
                    className={`collector-alert is-${alert.priority}`}
                    key={`${alert.kind}-${alert.itemProfileId || index}`}
                  >
                    <span className="collector-alert-icon">
                      {alert.priority === "urgent" ? (
                        <Warning weight="duotone" />
                      ) : (
                        <Clock weight="duotone" />
                      )}
                    </span>
                    <div>
                      <small>
                        {alert.kind.replaceAll("-", " ")}
                        {profile ? ` · ${profile.identity.displayName}` : ""}
                      </small>
                      <strong>{alert.label}</strong>
                    </div>
                    {alertAction(
                      alert,
                      profile,
                      openDialog,
                      onAddMaterial,
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="collector-quiet-state">
              <CheckCircle weight="duotone" />
              <div>
                <strong>Your dated care records are current</strong>
                <p>Add a new observation when condition changes or a specialist completes work.</p>
              </div>
            </div>
          )}
        </section>

        <section className="collector-care-section collector-plan-section">
          <div className="collector-section-heading">
            <div>
              <span className="eyebrow">Purposeful collecting</span>
              <h2>Gaps, not shopping pressure</h2>
            </div>
            <Sparkle weight="duotone" />
          </div>
          <p className="collector-section-intro">
            Record the role a future piece should play. No price alerts,
            countdowns, rankings, or marketplace urgency.
          </p>

          <div className="collector-plan-actions">
            <button type="button" onClick={() => openDialog("target")}>
              <Plus /> Add target
            </button>
            <button type="button" onClick={() => openDialog("wishlist")}>
              <LinkSimple /> Add research wish
            </button>
          </div>

          {gaps.targets.length || gaps.wishlist.length ? (
            <div className="collector-gap-list">
              {gaps.targets.map((target) => (
                <article key={target.id}>
                  <span className="collector-gap-type">Target</span>
                  <div>
                    <strong>{target.label}</strong>
                    <small>
                      {target.priority} priority
                      {target.candidateItemProfileIds.length
                        ? ` · ${target.candidateItemProfileIds.length} existing candidate`
                        : " · no match yet"}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      openDialog("match", {
                        targetId: target.id,
                        candidateItemProfileIds:
                          target.candidateItemProfileIds,
                      })
                    }
                    disabled={!target.candidateItemProfileIds.length}
                  >
                    Match piece
                  </button>
                </article>
              ))}
              {gaps.wishlist.map((entry) => (
                <article key={entry.id}>
                  <span className="collector-gap-type is-wish">Research</span>
                  <div>
                    <strong>{entry.label}</strong>
                    <small>
                      {entry.status} · {entry.priority} priority
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="collector-quiet-state is-compact">
              <Heart weight="duotone" />
              <div>
                <strong>This can remain open-ended</strong>
                <p>Add a target only when it clarifies the collection’s idea.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="collector-care-section collector-ledger-section">
        <div className="collector-section-heading">
          <div>
            <span className="eyebrow">Piece-by-piece ledger</span>
            <h2>Condition and service stay historical</h2>
          </div>
          <Wrench weight="duotone" />
        </div>
        <div className="collector-ledger">
          {profiles.map((profile) => {
            const asset = assetById.get(profile.assetId);
            const condition = latestFor(
              collector.conditionReports,
              profile.id,
              "observedAt",
            );
            const service = latestFor(
              collector.serviceEvents,
              profile.id,
              "serviceAt",
            );
            return (
              <article key={profile.id}>
                <div className="collector-ledger-identity">
                  <span className="collector-piece-index">
                    <Cube weight="duotone" />
                  </span>
                  <div>
                    <strong>{profile.identity.displayName}</strong>
                    <small>
                      {profile.kind}
                      {asset?.reference ? ` · ${asset.reference}` : ""}
                    </small>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Condition</dt>
                    <dd>
                      {condition?.grade || "Not checked"}
                      <small>{dateLabel(condition?.observedAt)}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Latest service</dt>
                    <dd>
                      {service?.serviceType || "None recorded"}
                      <small>{dateLabel(service?.serviceAt)}</small>
                    </dd>
                  </div>
                </dl>
                <div className="collector-ledger-actions">
                  <button
                    type="button"
                    onClick={() =>
                      openDialog("condition", { profileId: profile.id })
                    }
                  >
                    Condition
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openDialog("service", { profileId: profile.id })
                    }
                  >
                    Service
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="collector-care-section collector-completion-section">
        <div className="collector-section-heading">
          <div>
            <span className="eyebrow">Explainable completion</span>
            <h2>What the collection understands</h2>
          </div>
          <FileText weight="duotone" />
        </div>
        <div className="collector-dimension-grid">
          {Object.entries(completion.dimensions)
            .filter(([, dimension]) => dimension.applicableCount > 0)
            .map(([key, dimension]) => (
              <div key={key}>
                <span>
                  <strong>{DIMENSION_LABELS[key] || key}</strong>
                  <small>
                    {dimension.completeCount}/{dimension.applicableCount}
                  </small>
                </span>
                <div
                  className="collector-dimension-track"
                  aria-label={`${DIMENSION_LABELS[key] || key}: ${dimension.percent}%`}
                >
                  <span style={{ width: `${dimension.percent}%` }} />
                </div>
              </div>
            ))}
        </div>
      </section>

      {dialog && (
        <CollectorRecordDialog
          dialog={dialog}
          collectionId={collectionId}
          collector={collector}
          profiles={profiles}
          onClose={() => setDialog(null)}
          onSave={saveCommands}
        />
      )}
    </div>
  );
}

function CollectorRecordDialog({
  dialog,
  collectionId,
  collector,
  profiles,
  onClose,
  onSave,
}) {
  const selectableProfiles =
    dialog.kind === "match"
      ? profiles.filter((profile) =>
          (dialog.candidateItemProfileIds || []).includes(profile.id),
        )
      : profiles;
  const dialogRef = useRef(null);
  useCollectorDialogFocus(dialogRef, onClose);
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState(() => ({
    profileId: dialog.profileId || selectableProfiles[0]?.id || "",
    date: today,
    grade: "good",
    summary: "",
    nextDate: "",
    serviceType: "",
    serviceStatus: "completed",
    provider: "",
    label: "",
    priority: "normal",
    required: true,
    maker: "",
    model: "",
    reference: "",
    tags: "",
    targetId: dialog.targetId || "",
    notes: "",
    candidateUrl: "",
  }));
  const [error, setError] = useState("");
  const title = {
    condition: "Add condition check",
    service: "Add service record",
    target: "Define a collection gap",
    wishlist: "Add a research wish",
    match: "Match an existing piece",
  }[dialog.kind];
  const target = collector.collectionTargets.find(
    (item) => item.id === dialog.targetId,
  );

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function submit(event) {
    event.preventDefault();
    if (["condition", "service", "match"].includes(dialog.kind) && !draft.profileId) {
      setError("Choose a piece.");
      return;
    }
    if (dialog.kind === "condition") {
      onSave(
        [
          {
            type: "APPEND_CONDITION_REPORT",
            report: {
              id: makeId("condition"),
              itemProfileId: draft.profileId,
              observedAt: dateToIso(draft.date),
              grade: draft.grade,
              summary: draft.summary.trim() || null,
              nextReviewAt: dateToIso(draft.nextDate),
              privacy: "private",
            },
          },
        ],
        "Condition history updated.",
      );
      return;
    }
    if (dialog.kind === "service") {
      if (!draft.serviceType.trim()) {
        setError("Describe the service or care work.");
        return;
      }
      onSave(
        [
          {
            type: "APPEND_SERVICE_EVENT",
            event: {
              id: makeId("service"),
              itemProfileId: draft.profileId,
              serviceAt: dateToIso(draft.date),
              serviceType: draft.serviceType.trim(),
              status: draft.serviceStatus,
              providerLabel: draft.provider.trim() || null,
              summary: draft.summary.trim() || null,
              nextDueAt: dateToIso(draft.nextDate),
              privacy: "private",
            },
          },
        ],
        "Service history updated.",
      );
      return;
    }
    if (dialog.kind === "target") {
      if (!draft.label.trim()) {
        setError("Name the role or gap this target should fill.");
        return;
      }
      onSave(
        [
          {
            type: "UPSERT_COLLECTION_TARGET",
            target: {
              id: makeId("target"),
              collectionId,
              label: draft.label.trim(),
              priority: draft.priority,
              required: draft.required,
              criteria: {
                maker: draft.maker.trim() || null,
                model: draft.model.trim() || null,
                reference: draft.reference.trim() || null,
                tags: draft.tags
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              },
              status: "open",
            },
          },
          {
            type: "UPSERT_COLLECTION",
            collection: {
              id: collectionId,
              completionMode: "target-list",
            },
          },
        ],
        "Collection target added without marketplace pressure.",
      );
      return;
    }
    if (dialog.kind === "wishlist") {
      if (!draft.label.trim()) {
        setError("Name what you want to research.");
        return;
      }
      onSave(
        [
          {
            type: "UPSERT_WISHLIST_ENTRY",
            wishlistEntry: {
              id: makeId("wish"),
              collectionId,
              targetId: draft.targetId || null,
              label: draft.label.trim(),
              priority: draft.priority,
              status: "researching",
              notes: draft.notes.trim() || null,
              candidateUrls: draft.candidateUrl.trim()
                ? [draft.candidateUrl.trim()]
                : [],
            },
          },
        ],
        "Research wish added.",
      );
      return;
    }
    if (dialog.kind === "match" && target) {
      onSave(
        [
          {
            type: "UPSERT_COLLECTION_TARGET",
            target: {
              id: target.id,
              matchedItemProfileId: draft.profileId,
              status: "filled",
            },
          },
        ],
        "Existing piece matched to the collection gap.",
      );
    }
  }

  return (
    <div
      className="collector-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex="-1"
        className="collector-record-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collector-dialog-title"
      >
        <header>
          <div>
            <span className="eyebrow">Append, never overwrite</span>
            <h2 id="collector-dialog-title">{title}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        <form onSubmit={submit}>
          {["condition", "service", "match"].includes(dialog.kind) && (
            <label>
              <span>Piece</span>
              <select
                value={draft.profileId}
                onChange={(event) => set("profileId", event.target.value)}
              >
                {selectableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.identity.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}

          {dialog.kind === "condition" && (
            <>
              <div className="collector-form-row">
                <label>
                  <span>Observed on</span>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) => set("date", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Condition</span>
                  <select
                    value={draft.grade}
                    onChange={(event) => set("grade", event.target.value)}
                  >
                    {[
                      "mint",
                      "excellent",
                      "very-good",
                      "good",
                      "fair",
                      "poor",
                      "needs-attention",
                      "unknown",
                    ].map((grade) => (
                      <option value={grade} key={grade}>
                        {grade.replaceAll("-", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>What did you observe?</span>
                <textarea
                  rows="4"
                  value={draft.summary}
                  onChange={(event) => set("summary", event.target.value)}
                  placeholder="Wear, marks, changes, storage concerns, or what remains unchanged"
                />
              </label>
              <label>
                <span>Review again</span>
                <input
                  type="date"
                  value={draft.nextDate}
                  onChange={(event) => set("nextDate", event.target.value)}
                />
              </label>
            </>
          )}

          {dialog.kind === "service" && (
            <>
              <label>
                <span>Service or care work</span>
                <input
                  value={draft.serviceType}
                  onChange={(event) => set("serviceType", event.target.value)}
                  placeholder="Full service, conservation review, framing check…"
                  required
                />
              </label>
              <div className="collector-form-row">
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) => set("date", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={draft.serviceStatus}
                    onChange={(event) => set("serviceStatus", event.target.value)}
                  >
                    <option value="completed">Completed</option>
                    <option value="planned">Planned</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Provider or specialist</span>
                <input
                  value={draft.provider}
                  onChange={(event) => set("provider", event.target.value)}
                  placeholder="Private by default"
                />
              </label>
              <label>
                <span>Notes</span>
                <textarea
                  rows="3"
                  value={draft.summary}
                  onChange={(event) => set("summary", event.target.value)}
                />
              </label>
              <label>
                <span>Next due</span>
                <input
                  type="date"
                  value={draft.nextDate}
                  onChange={(event) => set("nextDate", event.target.value)}
                />
              </label>
            </>
          )}

          {dialog.kind === "target" && (
            <>
              <label>
                <span>What role should the piece fill?</span>
                <input
                  value={draft.label}
                  onChange={(event) => set("label", event.target.value)}
                  placeholder="The early reference that completes the design story"
                  required
                />
              </label>
              <div className="collector-form-row">
                <label>
                  <span>Priority</span>
                  <select
                    value={draft.priority}
                    onChange={(event) => set("priority", event.target.value)}
                  >
                    <option value="essential">Essential</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="someday">Someday</option>
                  </select>
                </label>
                <label className="collector-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(event) => set("required", event.target.checked)}
                  />
                  <span>Counts toward the collection plan</span>
                </label>
              </div>
              <div className="collector-form-row">
                <label>
                  <span>Maker</span>
                  <input
                    value={draft.maker}
                    onChange={(event) => set("maker", event.target.value)}
                  />
                </label>
                <label>
                  <span>Model or title</span>
                  <input
                    value={draft.model}
                    onChange={(event) => set("model", event.target.value)}
                  />
                </label>
              </div>
              <label>
                <span>Reference or catalog number</span>
                <input
                  value={draft.reference}
                  onChange={(event) => set("reference", event.target.value)}
                />
              </label>
              <label>
                <span>Meaningful tags</span>
                <input
                  value={draft.tags}
                  onChange={(event) => set("tags", event.target.value)}
                  placeholder="era, technique, person, place"
                />
              </label>
            </>
          )}

          {dialog.kind === "wishlist" && (
            <>
              <label>
                <span>Research subject</span>
                <input
                  value={draft.label}
                  onChange={(event) => set("label", event.target.value)}
                  placeholder="A piece worth learning about"
                  required
                />
              </label>
              <div className="collector-form-row">
                <label>
                  <span>Related gap</span>
                  <select
                    value={draft.targetId}
                    onChange={(event) => set("targetId", event.target.value)}
                  >
                    <option value="">Open research</option>
                    {collector.collectionTargets
                      .filter(
                        (item) =>
                          item.collectionId === collectionId &&
                          item.status === "open",
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select
                    value={draft.priority}
                    onChange={(event) => set("priority", event.target.value)}
                  >
                    <option value="essential">Essential</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="someday">Someday</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Why it belongs</span>
                <textarea
                  rows="4"
                  value={draft.notes}
                  onChange={(event) => set("notes", event.target.value)}
                  placeholder="The idea, story, maker, or gap this would clarify"
                />
              </label>
              <label>
                <span>Optional research link</span>
                <input
                  type="url"
                  value={draft.candidateUrl}
                  onChange={(event) => set("candidateUrl", event.target.value)}
                  placeholder="https://"
                />
              </label>
            </>
          )}

          {dialog.kind === "match" && (
            <div className="collector-dialog-explainer">
              <CheckCircle weight="duotone" />
              <div>
                <strong>{target?.label}</strong>
                <p>
                  Matching fills this gap with an existing Asset Passport. It
                  does not duplicate or move the item.
                </p>
              </div>
            </div>
          )}

          {error && <p className="collector-form-error" role="alert">{error}</p>}
          <footer>
            <p>
              <ShieldCheck /> Private fields remain outside collection
              showcases.
            </p>
            <div>
              <button type="button" className="secondary-button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary-button">
                <Check weight="bold" /> Save record
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
