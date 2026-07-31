import { BackupError } from "./backup-core.mjs";
import { readAuthenticatedBackup } from "./backup-operations.mjs";

const MAX_FRESHNESS_HOURS = 366 * 24;
const DEFAULT_CLOCK_SKEW_SECONDS = 5 * 60;

function finiteTimestamp(value, code, message) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new BackupError(code, message);
  }
  return timestamp;
}

export function validateFreshnessHours(value) {
  const hours = Number(value);
  if (
    !Number.isFinite(hours) ||
    !Number.isInteger(hours) ||
    hours < 1 ||
    hours > MAX_FRESHNESS_HOURS
  ) {
    throw new BackupError(
      "INVALID_FRESHNESS_WINDOW",
      `Backup freshness must be a whole number from 1 to ${MAX_FRESHNESS_HOURS} hours.`
    );
  }
  return hours;
}

export function evaluateBackupFreshness({
  backupId,
  completedAt,
  maxAgeHours,
  now = new Date(),
  allowedClockSkewSeconds = DEFAULT_CLOCK_SKEW_SECONDS
}) {
  const windowHours = validateFreshnessHours(maxAgeHours);
  const nowTimestamp = finiteTimestamp(
    now instanceof Date ? now.toISOString() : now,
    "INVALID_MONITOR_TIME",
    "Backup monitor time is invalid."
  );
  const completedTimestamp = finiteTimestamp(
    completedAt,
    "INVALID_BACKUP_COMPLETION_TIME",
    "Authenticated backup completion time is invalid."
  );
  if (
    !Number.isInteger(allowedClockSkewSeconds) ||
    allowedClockSkewSeconds < 0 ||
    allowedClockSkewSeconds > 3600
  ) {
    throw new BackupError(
      "INVALID_CLOCK_SKEW",
      "Allowed backup-monitor clock skew must be between 0 and 3600 seconds."
    );
  }

  const ageMilliseconds = nowTimestamp - completedTimestamp;
  if (ageMilliseconds < -allowedClockSkewSeconds * 1000) {
    throw new BackupError(
      "BACKUP_COMPLETION_IN_FUTURE",
      "Authenticated backup completion time is ahead of the monitor clock."
    );
  }

  const ageSeconds = Math.max(Math.floor(ageMilliseconds / 1000), 0);
  const maxAgeSeconds = windowHours * 60 * 60;
  if (ageSeconds > maxAgeSeconds) {
    throw new BackupError(
      "BACKUP_FRESHNESS_EXCEEDED",
      `Latest authenticated backup is ${ageSeconds} seconds old; the limit is ${maxAgeSeconds} seconds.`
    );
  }

  return {
    backupId,
    completedAt: new Date(completedTimestamp).toISOString(),
    checkedAt: new Date(nowTimestamp).toISOString(),
    ageSeconds,
    maxAgeSeconds,
    status: "fresh"
  };
}

export async function inspectBackupFreshness({
  adapter,
  key,
  maxAgeHours,
  now = new Date(),
  verifyArtifacts = false,
  onProgress = () => {}
}) {
  onProgress({ step: "freshness-list" });
  const candidates = await adapter.list(key);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new BackupError(
      "NO_COMMITTED_BACKUP",
      "No authenticated committed backup exists at the configured destination."
    );
  }

  const latest = [...candidates].sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      right.backupId.localeCompare(left.backupId)
  )[0];
  onProgress({ step: "freshness-authenticate" });
  const { manifest } = await readAuthenticatedBackup({
    adapter,
    backupId: latest.backupId,
    key,
    verifyArtifacts
  });
  const result = evaluateBackupFreshness({
    backupId: latest.backupId,
    completedAt: manifest.completedAt,
    maxAgeHours,
    now
  });
  return {
    ...result,
    artifactsVerified: verifyArtifacts,
    committedBackupsSeen: candidates.length
  };
}

export function backupMonitorFailureCanary(now = new Date()) {
  const checkedAt = now instanceof Date ? now.toISOString() : now;
  finiteTimestamp(
    checkedAt,
    "INVALID_MONITOR_TIME",
    "Backup monitor canary time is invalid."
  );
  throw new BackupError(
    "BACKUP_MONITOR_CANARY_FAILURE",
    `Intentional backup-monitor failure canary at ${checkedAt}.`
  );
}
