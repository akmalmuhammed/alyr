import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowClockwise,
  CheckCircle,
  CloudArrowDown,
  CloudArrowUp,
  HardDrives,
  LockKey,
  ShieldCheck,
  SignOut,
  UserPlus,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";
import { continuityApi, ContinuityApiError } from "./continuityApi.js";
import {
  createEncryptedRecoveryKit,
  decryptEncryptedRecoveryKit,
} from "./recoveryKit.js";
import {
  runBackupPreflight,
  runRestorePreflight,
} from "./backupPreflight.js";
import {
  readRecoveryRollback,
  rollbackRecoveryGeneration,
  stageAndActivateRecoveryGeneration,
} from "./restoreGeneration.js";
import { sha256Hex } from "./securityVault.js";

const SecureAccountContext = createContext(null);
const MIN_SECRET_LENGTH = 12;
const BACKUP_HISTORY_LIMIT = 10;

function friendlyError(error) {
  if (error instanceof ContinuityApiError) return error.message;
  return error?.message || "That action could not be completed.";
}

export function assertSessionWorkspaceOwnership(
  workspace,
  session,
  actionLabel = "used",
) {
  if (
    !workspace?.household?.id ||
    !session?.householdId ||
    workspace.household.id !== session.householdId
  ) {
    throw new Error(
      `This workspace belongs to a different household and was not ${actionLabel}.`,
    );
  }
  return true;
}

export function SecureAccountProvider({ children }) {
  const [state, setState] = useState({
    status: "checking",
    session: null,
    error: null,
  });

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setState((current) => ({ ...current, status: "checking", error: null }));
    }
    try {
      const session = await continuityApi.getSession();
      setState({
        status: session ? "authenticated" : "anonymous",
        session,
        error: null,
      });
      return session;
    } catch (error) {
      setState({
        status: error?.code === "SERVICE_UNAVAILABLE" ? "unavailable" : "error",
        session: null,
        error: friendlyError(error),
      });
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      async register(input) {
        const session = await continuityApi.register(input);
        setState({ status: "authenticated", session, error: null });
        return session;
      },
      async login(input) {
        const session = await continuityApi.login(input);
        setState({ status: "authenticated", session, error: null });
        return session;
      },
      async logout() {
        if (state.session?.csrfToken) {
          await continuityApi.logout(state.session.csrfToken);
        }
        setState({ status: "anonymous", session: null, error: null });
      },
    }),
    [refresh, state],
  );

  return (
    <SecureAccountContext.Provider value={value}>
      {children}
    </SecureAccountContext.Provider>
  );
}

export function useSecureAccount() {
  const context = useContext(SecureAccountContext);
  if (!context) throw new Error("SecureAccountProvider is missing.");
  return context;
}

function AccountForm({ mode, onModeChange, onSubmit, busy }) {
  const [form, setForm] = useState({
    displayName: "",
    householdName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (mode === "register" && !form.displayName.trim()) {
      setError("Add the name you want household members to recognize.");
      return;
    }
    if (!form.email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (form.password.length < MIN_SECRET_LENGTH) {
      setError(`Use at least ${MIN_SECRET_LENGTH} characters for the account password.`);
      return;
    }
    try {
      await onSubmit(form);
      setForm({
        displayName: "",
        householdName: "",
        email: "",
        password: "",
      });
    } catch (submitError) {
      setError(friendlyError(submitError));
    }
  }

  return (
    <div className="secure-account-auth">
      <div className="secure-auth-switch" role="tablist" aria-label="Account action">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={mode === "login" ? "is-active" : ""}
          onClick={() => onModeChange("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={mode === "register" ? "is-active" : ""}
          onClick={() => onModeChange("register")}
        >
          Create account
        </button>
      </div>
      <form onSubmit={submit} className="secure-auth-form">
        {mode === "register" && (
          <>
            <label>
              <span>Your name</span>
              <input
                autoComplete="name"
                value={form.displayName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                placeholder="How your household sees you"
              />
            </label>
            <label>
              <span>Household name <small>Optional</small></span>
              <input
                autoComplete="organization"
                value={form.householdName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    householdName: event.target.value,
                  }))
                }
                placeholder="The family archive"
              />
            </label>
          </>
        )}
        <label>
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
            placeholder="you@example.com"
          />
        </label>
        <label>
          <span>Account password</span>
          <input
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={form.password}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
            placeholder="At least 12 characters"
          />
        </label>
        {error && (
          <div className="secure-inline-error" role="alert">
            <Warning weight="bold" /> {error}
          </div>
        )}
        <button className="primary-button" disabled={busy}>
          {mode === "register" ? (
            <>
              <UserPlus weight="bold" /> Create secure account
            </>
          ) : (
            <>
              <LockKey weight="bold" /> Sign in
            </>
          )}
        </button>
      </form>
      <p className="secure-account-footnote">
        Account authentication controls access. Your separate vault passphrase
        encrypts backup contents in this browser and is never sent to the service.
      </p>
    </div>
  );
}

function HouseholdAccess({ session }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: "", role: "viewer" });
  const [feedback, setFeedback] = useState(null);
  const canManage = ["owner", "admin"].includes(session.role);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      setMembers(await continuityApi.getMembers());
      setFeedback(null);
    } catch (error) {
      setFeedback({ tone: "error", text: friendlyError(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function submit(event) {
    event.preventDefault();
    setFeedback(null);
    if (!form.email.includes("@")) {
      setFeedback({ tone: "error", text: "Enter the member’s account email." });
      return;
    }
    try {
      const result = await continuityApi.grantAccess(
        form,
        session.csrfToken,
      );
      setFeedback({
        tone: "success",
        text: result?.message || "Household access updated.",
      });
      setForm({ email: "", role: "viewer" });
      await loadMembers();
    } catch (error) {
      setFeedback({ tone: "error", text: friendlyError(error) });
    }
  }

  return (
    <section className="secure-household-access" aria-labelledby="household-access-title">
      <div className="secure-section-heading">
        <span>
          <UsersThree weight="duotone" />
        </span>
        <div>
          <small>Household access</small>
          <h3 id="household-access-title">{session.householdName}</h3>
        </div>
        <button className="icon-button" aria-label="Refresh household members" onClick={loadMembers}>
          <ArrowClockwise />
        </button>
      </div>
      {loading ? (
        <p className="secure-muted">Checking current access…</p>
      ) : (
        <div className="secure-member-list">
          {members.map((member) => (
            <div key={member.accountId} className="secure-member-row">
              <span>{member.displayName?.slice(0, 1).toUpperCase() || "M"}</span>
              <div>
                <strong>{member.displayName}</strong>
                <small>{member.email}</small>
              </div>
              <em>{member.role}</em>
            </div>
          ))}
        </div>
      )}
      {canManage && (
        <form className="secure-grant-form" onSubmit={submit}>
          <label>
            <span>Existing account email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="family@example.com"
            />
          </label>
          <label>
            <span>Role</span>
            <select
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({ ...current, role: event.target.value }))
              }
            >
              <option value="viewer">Viewer · membership only in this build</option>
              <option value="contributor">Contributor · membership only in this build</option>
              <option value="editor">Editor · membership only in this build</option>
              {session.role === "owner" && (
                <option value="admin">Admin · members and encrypted backup</option>
              )}
            </select>
          </label>
          <button className="secondary-button">
            <UserPlus weight="bold" /> Grant access
          </button>
        </form>
      )}
      {feedback && (
        <div
          className={`secure-inline-${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.tone === "error" ? <Warning /> : <CheckCircle />}
          {feedback.text}
        </div>
      )}
      <p className="secure-account-footnote">
        Grants apply on the service, not only in this interface. Invite delivery,
        revocation ceremonies, and field-level sharing still require the production identity service.
      </p>
    </section>
  );
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function normalizeBackupHistory(payload) {
  const backups = Array.isArray(payload?.backups) ? payload.backups : [];
  const latestBackupId =
    typeof payload?.latestBackupId === "string"
      ? payload.latestBackupId
      : backups[0]?.backupId || null;
  return Object.freeze({
    backups,
    latestBackupId,
    total: Number.isFinite(payload?.total) ? payload.total : backups.length,
    retention: payload?.retention || null,
  });
}

function missingNamesFromRecovery(decrypted) {
  const includedEvidenceIds = new Set(
    (decrypted?.manifest || []).map((entry) => entry.evidenceId),
  );
  return (decrypted?.workspace?.evidence || [])
    .filter(
      (evidence) =>
        Boolean(evidence.fileName) && !includedEvidenceIds.has(evidence.id),
    )
    .map((evidence) => evidence.fileName);
}

function backupBlockingMessage(preflight) {
  return (
    preflight?.coverage?.integrityFailures?.[0]?.message ||
    preflight?.capacity?.blockingReasons?.[0]?.message ||
    "The recovery snapshot failed its safety preflight and was not encrypted or uploaded."
  );
}

function quotaSummary(storage) {
  if (storage?.status === "adequate") {
    return `${formatBytes(storage.availableBytes)} estimated browser capacity available`;
  }
  if (storage?.status === "insufficient") {
    return `${formatBytes(storage.availableBytes)} estimated available; ${formatBytes(
      storage.requiredBytes,
    )} projected`;
  }
  return "Browser capacity estimate unavailable";
}

function EncryptedBackup({
  workspace,
  dispatch,
  setAnnouncement,
  session,
  storageScopeId,
  recoveryHeadRevision,
  adoptRecoveryHead,
}) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [remoteMeta, setRemoteMeta] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [backupHistory, setBackupHistory] = useState({
    backups: [],
    latestBackupId: null,
    total: 0,
    retention: null,
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [backupPreflight, setBackupPreflight] = useState(null);
  const [partialAcknowledged, setPartialAcknowledged] = useState(false);
  const [rollbackAvailable, setRollbackAvailable] = useState(false);
  const canUseBackup = ["owner", "admin"].includes(session.role);

  const loadBackupHistory = useCallback(
    async ({ quiet = false, suppressFeedback = false } = {}) => {
      if (!canUseBackup) return normalizeBackupHistory(null);
      if (!quiet) setHistoryLoading(true);
      try {
        const normalized = normalizeBackupHistory(
          await continuityApi.getBackupHistory({
            limit: BACKUP_HISTORY_LIMIT,
          }),
        );
        setBackupHistory(normalized);
        const latest =
          normalized.backups.find(
            (backup) => backup.backupId === normalized.latestBackupId,
          ) ||
          normalized.backups[0] ||
          null;
        setRemoteMeta(latest);
        return normalized;
      } catch (error) {
        if (!suppressFeedback) {
          setFeedback({
            tone: "error",
            text: `Backup history could not be checked. ${friendlyError(error)}`,
          });
        }
        throw error;
      } finally {
        if (!quiet) setHistoryLoading(false);
      }
    },
    [canUseBackup],
  );

  useEffect(() => {
    if (!canUseBackup) return;
    loadBackupHistory().catch(() => {});
  }, [canUseBackup, loadBackupHistory]);

  useEffect(() => {
    try {
      setRollbackAvailable(Boolean(readRecoveryRollback(storageScopeId)));
    } catch {
      setRollbackAvailable(false);
    }
  }, [storageScopeId]);

  useEffect(() => {
    setBackupPreflight(null);
    setPartialAcknowledged(false);
  }, [storageScopeId, workspace]);

  function validatePassphrase() {
    if (passphrase.length < MIN_SECRET_LENGTH) {
      setFeedback({
        tone: "error",
        text: `Use a vault passphrase with at least ${MIN_SECRET_LENGTH} characters.`,
      });
      return false;
    }
    return true;
  }

  async function createBackup() {
    if (!validatePassphrase()) return;
    setBusy("upload");
    setFeedback({
      tone: "progress",
      text: "Observing the latest service version and checking every referenced original…",
    });
    try {
      assertSessionWorkspaceOwnership(workspace, session, "backed up");
      const observed = await loadBackupHistory({
        quiet: true,
        suppressFeedback: true,
      });
      const preflight = await runBackupPreflight({
        workspace,
        storageScopeId,
      });
      setBackupPreflight(preflight);
      if (preflight.status === "blocked") {
        setFeedback({
          tone: "error",
          text: backupBlockingMessage(preflight),
        });
        return;
      }
      if (preflight.status === "partial" && !partialAcknowledged) {
        setFeedback({
          tone: "error",
          text:
            "This recovery snapshot is partial because originals or unfinished drafts are excluded. " +
            "Review the coverage and acknowledge it before uploading.",
        });
        return;
      }
      const kit = await createEncryptedRecoveryKit({
        workspace,
        originals: preflight.originals,
        passphrase,
      });
      const payload = JSON.stringify(kit);
      const byteLength = new TextEncoder().encode(payload).byteLength;
      const checksum = await sha256Hex(payload);
      const result = await continuityApi.createBackup(
        {
          payload,
          checksum,
          byteLength,
          createdAt: kit.createdAt,
        },
        session.csrfToken,
        { baseBackupId: observed.latestBackupId },
      );
      const meta = result?.backup || result;
      setRemoteMeta(meta);
      await loadBackupHistory({
        quiet: true,
        suppressFeedback: true,
      }).catch(() => {});
      setPassphrase("");
      setBackupPreflight(null);
      setPartialAcknowledged(false);
      setFeedback({
        tone: "success",
        text: `Encrypted recovery snapshot stored with ${
          preflight.coverage.includedOriginalCount
        } of ${preflight.coverage.referencedOriginalCount} referenced original${
          preflight.coverage.referencedOriginalCount === 1 ? "" : "s"
        }.`,
      });
      setAnnouncement?.(
        "Encrypted account backup stored durably by the connected service.",
      );
    } catch (error) {
      if (
        error instanceof ContinuityApiError &&
        error.code === "BACKUP_STALE"
      ) {
        if (error.details?.latest) {
          setRemoteMeta(error.details.latest);
        }
        await loadBackupHistory({
          quiet: true,
          suppressFeedback: true,
        }).catch(() => {});
        setFeedback({
          tone: "error",
          text:
            "Another signed-in device stored a newer encrypted snapshot first. " +
            "This snapshot was not uploaded. Review the refreshed history, then retry from the latest version.",
        });
      } else {
        setFeedback({ tone: "error", text: friendlyError(error) });
      }
    } finally {
      setBusy(null);
    }
  }

  async function openBackup(backupId = null) {
    if (!validatePassphrase()) return;
    setBusy("download");
    setPendingRestore(null);
    setFeedback({
      tone: "progress",
      text: "Downloading the selected ciphertext, checking its checksum, and opening it in memory…",
    });
    try {
      const backup = backupId
        ? await continuityApi.getBackupById(backupId)
        : await continuityApi.getLatestBackup();
      if (backupId && backup?.backupId !== backupId) {
        throw new Error(
          "The service returned a different backup version, so nothing was opened.",
        );
      }
      const payload = String(backup?.payload || "");
      const bytes = new TextEncoder().encode(payload).byteLength;
      const checksum = await sha256Hex(payload);
      if (
        !payload ||
        checksum !== backup.checksum ||
        bytes !== Number(backup.byteLength)
      ) {
        throw new Error(
          "The downloaded backup failed its checksum and was not opened.",
        );
      }
      const decrypted = await decryptEncryptedRecoveryKit(
        payload,
        passphrase,
      );
      assertSessionWorkspaceOwnership(
        decrypted.workspace,
        session,
        "opened",
      );
      const restorePreflight = await runRestorePreflight({
        recovered: decrypted,
      });
      if (!backupId) setRemoteMeta(backup);
      setPendingRestore({
        ...decrypted,
        sourceBackup: backup,
        restorePreflight,
        missingOriginalNames: missingNamesFromRecovery(decrypted),
      });
      setPassphrase("");
      setFeedback({
        tone: restorePreflight.status === "blocked" ? "error" : "success",
        text:
          restorePreflight.status === "blocked"
            ? "The encrypted snapshot opened, but its restore preflight found an integrity conflict. It cannot be activated."
            : "Encrypted snapshot opened in memory. Review its coverage before activating it on this device.",
      });
    } catch (error) {
      setFeedback({ tone: "error", text: friendlyError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    setBusy("restore");
    try {
      assertSessionWorkspaceOwnership(
        pendingRestore.workspace,
        session,
        "restored",
      );
      const restorePreflight = await runRestorePreflight({
        recovered: pendingRestore,
      });
      setPendingRestore((current) =>
        current ? { ...current, restorePreflight } : current,
      );
      if (restorePreflight.status === "blocked") {
        throw new Error(
          restorePreflight.coverage.integrityFailures?.[0]?.message ||
            "The recovered generation failed its final integrity preflight and was not activated.",
        );
      }
      const activation = await stageAndActivateRecoveryGeneration({
        scopeId: storageScopeId,
        currentWorkspace: workspace,
        recoveredWorkspace: pendingRestore.workspace,
        expectedHeadRevision: recoveryHeadRevision ?? undefined,
        files: restorePreflight.originals.map((original) => {
          const file = new File([original.blob], original.fileName, {
            type: original.fileType,
            lastModified: Date.parse(pendingRestore.createdAt),
          });
          return {
            evidenceId: original.evidenceId,
            file,
            expectedFileName: original.fileName,
            expectedFileType: original.fileType,
            expectedFileSize: original.fileSize,
            expectedFileChecksum: original.fileChecksum,
            originalVersionId: original.originalVersionId,
          };
        }),
      });
      adoptRecoveryHead?.(activation, activation.workspace);
      dispatch({
        type: "REPLACE_WORKSPACE",
        workspace: activation.workspace,
      });
      setPendingRestore(null);
      setRollbackAvailable(true);
      setFeedback({
        tone: "success",
        text: "The reviewed snapshot is active as a verified local generation. The prior generation is available for one-step undo.",
      });
      setAnnouncement?.(
        "Encrypted account backup restored after checksum and content validation.",
      );
    } catch (error) {
      setFeedback({ tone: "error", text: friendlyError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function undoRestore() {
    setBusy("rollback");
    setFeedback({
      tone: "progress",
      text: "Reactivating the previous verified device generation…",
    });
    try {
      const rollback = await rollbackRecoveryGeneration({
        scopeId: storageScopeId,
        expectedHeadRevision: recoveryHeadRevision ?? undefined,
      });
      adoptRecoveryHead?.(rollback, rollback.workspace);
      dispatch({
        type: "REPLACE_WORKSPACE",
        workspace: rollback.workspace,
      });
      setRollbackAvailable(false);
      setPendingRestore(null);
      setFeedback({
        tone: "success",
        text: rollback.cleaned
          ? "The previous device generation is active again."
          : "The previous generation is active again. Inactive recovery files remain queued for cleanup.",
      });
      setAnnouncement?.("The most recent account recovery was undone.");
    } catch (error) {
      setFeedback({ tone: "error", text: friendlyError(error) });
    } finally {
      setBusy(null);
    }
  }

  const pendingCoverage =
    pendingRestore?.restorePreflight?.coverage ||
    pendingRestore?.coverage ||
    null;

  return (
    <section className="secure-backup-workbench" aria-labelledby="encrypted-backup-title">
      <div className="secure-section-heading">
        <span>
          <ShieldCheck weight="duotone" />
        </span>
        <div>
          <small>Cross-device recovery</small>
          <h3 id="encrypted-backup-title">Encrypted account backup</h3>
        </div>
      </div>
      <p>
        Encrypt the current workspace and originals that are actually available
        on this device. Missing originals are never silently represented as
        backed up. The service stores ciphertext and an integrity checksum; it
        never receives this passphrase.
      </p>
      {!canUseBackup && (
        <div className="secure-inline-progress" role="note">
          <LockKey weight="bold" />
          Encrypted recovery snapshots are limited to household owners and
          admins. This development service does not expose the ciphertext to a
          {` ${session.role}`}; record-level sharing is not connected yet.
        </div>
      )}
      <label className="secure-vault-secret">
        <span>Vault passphrase</span>
        <input
          type="password"
          autoComplete="off"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          placeholder="Separate from your account password"
        />
        <small>Not saved. You need the same phrase on another device.</small>
      </label>
      <div className="secure-backup-actions">
        <button
          className="primary-button"
          onClick={createBackup}
          disabled={Boolean(busy) || !canUseBackup}
        >
          <CloudArrowUp weight="bold" />
          {busy === "upload" ? "Encrypting…" : "Back up this device"}
        </button>
        <button
          className="secondary-button"
          onClick={() => openBackup()}
          disabled={Boolean(busy) || !canUseBackup}
        >
          <CloudArrowDown weight="bold" />
          {busy === "download" ? "Opening…" : "Retrieve latest backup"}
        </button>
      </div>
      <p className="secure-account-footnote">
        Unfinished capture drafts stay on this device and are not included in an
        account snapshot.
      </p>
      {backupPreflight && (
        <div
          className="secure-restore-review"
          role={backupPreflight.status === "blocked" ? "alert" : "status"}
        >
          <span className="secure-restore-kicker">Backup coverage check</span>
          <div>
            <span>
              <strong>
                {backupPreflight.coverage.includedOriginalCount}
              </strong>
              originals included
            </span>
            <span>
              <strong>
                {backupPreflight.coverage.referencedOriginalCount}
              </strong>
              originals referenced
            </span>
            <span>
              <strong>
                {formatBytes(backupPreflight.capacity.projectedPackageBytes)}
              </strong>
              projected encrypted
            </span>
            <span>
              <strong>
                {formatBytes(backupPreflight.coverage.originalBytes)}
              </strong>
              original bytes
            </span>
          </div>
          {backupPreflight.coverage.missingOriginalCount > 0 && (
            <p>
              Not available here:{" "}
              {backupPreflight.coverage.missing
                .map((entry) => entry.fileName)
                .join(", ")}
              . These named files will not be in this encrypted snapshot.
            </p>
          )}
          {backupPreflight.coverage.integrityFailureCount > 0 && (
            <p>
              Integrity block:{" "}
              {backupPreflight.coverage.integrityFailures
                .map(
                  (entry) =>
                    `${entry.fileName || "Workspace"} — ${entry.message}`,
                )
                .join(" ")}
            </p>
          )}
          {backupPreflight.capacity.blockingReasons.length > 0 && (
            <p>
              Capacity block:{" "}
              {backupPreflight.capacity.blockingReasons
                .map((entry) => entry.message)
                .join(" ")}
            </p>
          )}
          <p>
            Draft check: {backupPreflight.drafts.totalDraftCount} unfinished{" "}
            capture draft
            {backupPreflight.drafts.totalDraftCount === 1 ? "" : "s"}
            {backupPreflight.drafts.fileCount
              ? ` with ${backupPreflight.drafts.fileCount} draft file${
                  backupPreflight.drafts.fileCount === 1 ? "" : "s"
                }`
              : ""}
            . Drafts are excluded from this snapshot.
            {backupPreflight.drafts.status !== "known"
              ? " Draft discovery was incomplete, so this count may be lower than the device total."
              : ""}
          </p>
          <p>
            Browser capacity (advisory):{" "}
            {quotaSummary(backupPreflight.browserStorage)}.
          </p>
          {backupPreflight.status === "ready" && (
            <p>
              Every workspace evidence record that references an original has a
              checksum-verified local file ready for this snapshot.
            </p>
          )}
          {backupPreflight.status === "partial" && (
            <label>
              <input
                type="checkbox"
                checked={partialAcknowledged}
                onChange={(event) =>
                  setPartialAcknowledged(event.target.checked)
                }
              />{" "}
              I understand this is a partial recovery snapshot and the named
              originals or unfinished drafts described above are excluded.
            </label>
          )}
        </div>
      )}
      {remoteMeta?.createdAt && (
        <div className="secure-backup-meta">
          <HardDrives weight="duotone" />
          <span>
            <small>Latest encrypted service snapshot</small>
            <strong>{new Date(remoteMeta.createdAt).toLocaleString()}</strong>
          </span>
          {remoteMeta.byteLength ? (
            <em>
              {remoteMeta.version ? `Version ${remoteMeta.version} · ` : ""}
              {formatBytes(remoteMeta.byteLength)} encrypted
            </em>
          ) : null}
        </div>
      )}
      {canUseBackup && (
        <>
          <div className="secure-backup-actions">
            <button
              className="text-button"
              onClick={() => loadBackupHistory().catch(() => {})}
              disabled={Boolean(busy) || historyLoading}
            >
              <ArrowClockwise
                className={historyLoading ? "is-spinning" : undefined}
              />
              {historyLoading ? "Refreshing history…" : "Refresh backup history"}
            </button>
            <span className="secure-account-footnote">
              Showing {backupHistory.backups.length} of {backupHistory.total}{" "}
              retained version{backupHistory.total === 1 ? "" : "s"}.
            </span>
          </div>
          {backupHistory.backups.length > 0 && (
            <div
              className="secure-member-list"
              aria-label="Encrypted backup history"
            >
              {backupHistory.backups.map((backup) => (
                <div className="secure-member-row" key={backup.backupId}>
                  <span>{backup.version || "—"}</span>
                  <div>
                    <strong>
                      {new Date(backup.createdAt).toLocaleString()}
                      {backup.backupId === backupHistory.latestBackupId
                        ? " · Latest"
                        : ""}
                    </strong>
                    <small>
                      {formatBytes(backup.byteLength)} encrypted ·{" "}
                      {backup.backupId}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => openBackup(backup.backupId)}
                    disabled={Boolean(busy)}
                    aria-label={`Open encrypted backup version ${
                      backup.version || backup.backupId
                    }`}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {pendingRestore && (
        <div className="secure-restore-review">
          <span className="secure-restore-kicker">
            Review before activating this generation
          </span>
          <div>
            <span>
              <strong>{pendingRestore.workspace.assets?.length || 0}</strong>
              assets
            </span>
            <span>
              <strong>{pendingRestore.workspace.places?.length || 0}</strong>
              places
            </span>
            <span>
              <strong>
                {pendingCoverage?.includedOriginalCount ??
                  pendingRestore.originals.length}
              </strong>
              originals included
            </span>
            <span>
              <strong>
                {pendingCoverage?.referencedOriginalCount ??
                  pendingRestore.originals.length}
              </strong>
              originals referenced
            </span>
          </div>
          <p>
            {pendingRestore.sourceBackup?.version
              ? `Service version ${pendingRestore.sourceBackup.version}. `
              : ""}
            Created {new Date(pendingRestore.createdAt).toLocaleString()}. The
            recovered workspace and originals will be staged and verified before
            one active-generation pointer changes. The current generation remains
            available for one-step undo.
          </p>
          {(pendingCoverage?.missingOriginalCount || 0) > 0 && (
            <p>
              This snapshot is partial: {pendingCoverage.missingOriginalCount}{" "}
              referenced original
              {pendingCoverage.missingOriginalCount === 1 ? " is" : "s are"}{" "}
              absent
              {pendingRestore.missingOriginalNames?.length
                ? ` (${pendingRestore.missingOriginalNames.join(", ")})`
                : ""}
              .
            </p>
          )}
          {(pendingCoverage?.integrityFailureCount || 0) > 0 && (
            <p>
              Activation blocked:{" "}
              {pendingCoverage.integrityFailures
                .map(
                  (entry) =>
                    `${entry.fileName || "Recovery data"} — ${entry.message}`,
                )
                .join(" ")}
            </p>
          )}
          {pendingRestore.restorePreflight && (
            <p>
              Staging estimate:{" "}
              {formatBytes(
                pendingRestore.restorePreflight.requiredStagingBytes,
              )}
              . Browser capacity (advisory):{" "}
              {quotaSummary(
                pendingRestore.restorePreflight.browserStorage,
              )}
              .
            </p>
          )}
          <div className="secure-backup-actions">
            <button
              className="danger-button"
              onClick={confirmRestore}
              disabled={
                Boolean(busy) ||
                pendingRestore.restorePreflight?.status === "blocked"
              }
            >
              {busy === "restore"
                ? "Staging and verifying…"
                : pendingRestore.restorePreflight?.status === "partial"
                  ? "Activate partial recovered generation"
                  : "Activate recovered generation"}
            </button>
            <button
              className="text-button"
              onClick={() => setPendingRestore(null)}
              disabled={Boolean(busy)}
            >
              Keep current device
            </button>
          </div>
        </div>
      )}
      {rollbackAvailable && !pendingRestore && (
        <div className="secure-restore-review">
          <span className="secure-restore-kicker">Recovery undo available</span>
          <p>
            The device generation from immediately before the most recent
            recovery is still available.
          </p>
          <div className="secure-backup-actions">
            <button
              className="secondary-button"
              onClick={undoRestore}
              disabled={Boolean(busy)}
            >
              <ArrowClockwise weight="bold" />
              {busy === "rollback"
                ? "Reactivating…"
                : "Undo last recovery"}
            </button>
          </div>
        </div>
      )}
      {feedback && (
        <div
          className={`secure-inline-${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.tone === "error" ? (
            <Warning weight="bold" />
          ) : feedback.tone === "success" ? (
            <CheckCircle weight="bold" />
          ) : (
            <ArrowClockwise className="is-spinning" />
          )}
          {feedback.text}
        </div>
      )}
      <div className="secure-account-boundary">
        <LockKey weight="duotone" />
        <p>
          This proves authenticated, persistent retrieval against the local
          Continuity service. Production still requires HTTPS deployment,
          passkeys, managed keys, monitored backups, malware isolation, and
          independent restore drills.
        </p>
      </div>
    </section>
  );
}

export function SecureAccountPanel({
  workspace,
  dispatch,
  setAnnouncement,
  storageScopeId,
  recoveryHeadRevision,
  adoptRecoveryHead,
}) {
  const account = useSecureAccount();
  const [mode, setMode] = useState("register");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  async function authenticate(input) {
    setBusy(true);
    setAuthError("");
    try {
      if (mode === "register") {
        await account.register(input);
        setAnnouncement?.("Secure local account created and this device signed in.");
      } else {
        await account.login(input);
        setAnnouncement?.("Signed in to the secure local account service.");
      }
    } catch (error) {
      setAuthError(friendlyError(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }

  if (account.status === "checking") {
    return (
      <section className="secure-account-panel is-checking" aria-live="polite">
        <ArrowClockwise className="is-spinning" />
        <div>
          <strong>Checking secure account service</strong>
          <small>Authenticated records stay locked until this check completes.</small>
        </div>
      </section>
    );
  }

  if (["unavailable", "error"].includes(account.status)) {
    return (
      <section className="secure-account-panel is-unavailable">
        <div className="secure-account-intro">
          <span className="secure-account-mark">
            <Warning weight="duotone" />
          </span>
          <div>
            <small>P1 service boundary</small>
            <h2>Secure accounts are not connected on this preview server</h2>
            <p>
              The app remains local and manual recovery kits still work. Start the
              full-stack Continuity service to test real sessions and durable
              encrypted retrieval.
            </p>
          </div>
        </div>
        <button className="secondary-button" onClick={() => account.refresh()}>
          <ArrowClockwise weight="bold" /> Check again
        </button>
      </section>
    );
  }

  if (account.status === "anonymous") {
    return (
      <section className="secure-account-panel">
        <div className="secure-account-intro">
          <span className="secure-account-mark">
            <ShieldCheck weight="duotone" />
          </span>
          <div>
            <small>Optional local service</small>
            <h2>Recover beyond this browser</h2>
            <p>
              Create an authenticated account, then encrypt and store a recovery
              copy that another signed-in browser session on this development
              computer can retrieve.
            </p>
          </div>
        </div>
        {authError && (
          <div className="secure-inline-error" role="alert">
            <Warning /> {authError}
          </div>
        )}
        <AccountForm
          mode={mode}
          onModeChange={setMode}
          onSubmit={authenticate}
          busy={busy}
        />
      </section>
    );
  }

  const { session } = account;
  return (
    <section className="secure-account-panel is-connected">
      <header className="secure-account-session">
        <span className="secure-account-avatar">
          {session.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <small>Signed in · {session.role}</small>
          <h2>{session.displayName}</h2>
          <p>{session.email}</p>
        </div>
        <button
          className="text-button"
          onClick={async () => {
            try {
              await account.logout();
              setAnnouncement?.(
                "Signed out. The account workspace is locked and the local-only workspace is active.",
              );
            } catch (error) {
              setAuthError(friendlyError(error));
            }
          }}
        >
          <SignOut weight="bold" /> Sign out
        </button>
      </header>
      {authError && (
        <div className="secure-inline-error" role="alert">
          <Warning /> {authError}
        </div>
      )}
      <div className="secure-account-grid">
        <EncryptedBackup
          workspace={workspace}
          dispatch={dispatch}
          setAnnouncement={setAnnouncement}
          session={session}
          storageScopeId={storageScopeId}
          recoveryHeadRevision={recoveryHeadRevision}
          adoptRecoveryHead={adoptRecoveryHead}
        />
        <HouseholdAccess session={session} />
      </div>
    </section>
  );
}
