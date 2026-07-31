import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync
} from "expo-crypto";

declare const vaultScopeIdBrand: unique symbol;

/**
 * An opaque, path-safe identifier. Authenticated scope IDs are derived from
 * account + household identity, but those source identifiers are never
 * persisted in local filenames or SecureStore key names.
 */
export type VaultScopeId = string & {
  readonly [vaultScopeIdBrand]: "VaultScopeId";
};

export interface VaultScope {
  readonly kind: "device-preview" | "signed-sample" | "authenticated";
  readonly scopeId: VaultScopeId;
  readonly databaseName: string;
  readonly databaseKeyName: string;
  readonly attachmentKeyName: string;
  readonly protectedAttachmentDirectoryName: string;
  readonly materializedAttachmentDirectoryName: string;
}

const DEVICE_PREVIEW_SCOPE_ID = "device-preview-v1";
const SIGNED_OUT_SAMPLE_SCOPE_ID = "signed-sample-v1";
const AUTHENTICATED_SCOPE_ID_PATTERN = /^auth-v1-[a-f0-9]{64}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const MAX_IDENTITY_COMPONENT_LENGTH = 512;

function authenticatedLayout(scopeId: VaultScopeId): VaultScope {
  return Object.freeze({
    kind: "authenticated",
    scopeId,
    databaseName: `alyr-vault-${scopeId}.db`,
    databaseKeyName: `alyr.native.vault.${scopeId}.database-key.v1`,
    attachmentKeyName: `alyr.native.vault.${scopeId}.attachment-key.v1`,
    protectedAttachmentDirectoryName: `alyr-vault-${scopeId}-attachments`,
    materializedAttachmentDirectoryName: `alyr-vault-${scopeId}-materialized`
  });
}

/**
 * The current no-cloud/device-preview vault deliberately retains the original
 * filenames and SecureStore keys. That keeps existing local preview installs
 * readable while authenticated households move only through an explicit,
 * reviewed migration instead of silently sharing this device-level vault.
 */
export const DEVICE_PREVIEW_VAULT_SCOPE: VaultScope = Object.freeze({
  kind: "device-preview",
  scopeId: DEVICE_PREVIEW_SCOPE_ID as VaultScopeId,
  databaseName: "alyr-continuity.db",
  databaseKeyName: "alyr.native.database-key.v1",
  attachmentKeyName: "alyr.native.attachment-key.v1",
  protectedAttachmentDirectoryName: "alyr-attachments",
  materializedAttachmentDirectoryName: "alyr-materialized"
});

/**
 * A durable, encrypted local scope for the signed-out sample journey.
 *
 * It deliberately has no account or household identity and never shares a
 * database, key, attachment directory, or materialized-file directory with
 * either the legacy preview scope or an authenticated household vault.
 */
export const SIGNED_OUT_SAMPLE_VAULT_SCOPE: VaultScope = Object.freeze({
  kind: "signed-sample",
  scopeId: SIGNED_OUT_SAMPLE_SCOPE_ID as VaultScopeId,
  databaseName: "alyr-signed-sample-v1.db",
  databaseKeyName: "alyr.native.signed-sample.database-key.v1",
  attachmentKeyName: "alyr.native.signed-sample.attachment-key.v1",
  protectedAttachmentDirectoryName: "alyr-signed-sample-v1-attachments",
  materializedAttachmentDirectoryName: "alyr-signed-sample-v1-materialized"
});

function validateIdentityComponent(
  value: string,
  label: "accountId" | "householdId"
): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_IDENTITY_COMPONENT_LENGTH ||
    value.trim() !== value ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new Error(`A valid ${label} is required to open a Heldat vault.`);
  }
}

/**
 * Creates the stable local scope for one authenticated account membership.
 *
 * Account and household values are length-safe JSON fields inside a
 * domain-separated SHA-256 input. Only the digest is retained by the returned
 * object. A household under another account (or vice versa) therefore receives
 * a different database, outbox, key pair, protected directory, and temp
 * directory.
 */
export async function deriveAuthenticatedVaultScope(
  accountId: string,
  householdId: string
): Promise<VaultScope> {
  validateIdentityComponent(accountId, "accountId");
  validateIdentityComponent(householdId, "householdId");

  const digest = (
    await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      `ALYR_LOCAL_VAULT_SCOPE_V1\n${JSON.stringify({
        accountId,
        householdId
      })}`,
      { encoding: CryptoEncoding.HEX }
    )
  ).toLowerCase();

  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new Error("The authenticated vault scope digest was invalid.");
  }

  return authenticatedLayout(`auth-v1-${digest}` as VaultScopeId);
}

/**
 * Reconstructs a scope from an already-derived opaque identifier. Raw account
 * or household identifiers are intentionally not accepted here.
 */
export function vaultScopeFromOpaqueId(scopeId: string): VaultScope {
  if (scopeId === DEVICE_PREVIEW_SCOPE_ID) {
    return DEVICE_PREVIEW_VAULT_SCOPE;
  }
  if (scopeId === SIGNED_OUT_SAMPLE_SCOPE_ID) {
    return SIGNED_OUT_SAMPLE_VAULT_SCOPE;
  }
  if (!AUTHENTICATED_SCOPE_ID_PATTERN.test(scopeId)) {
    throw new Error("The local vault scope identifier is invalid.");
  }
  return authenticatedLayout(scopeId as VaultScopeId);
}

/**
 * Rejects forged or partially mixed scope objects before they reach a key,
 * database, or filesystem API.
 */
export function assertValidVaultScope(scope: VaultScope): VaultScope {
  if (!scope || typeof scope !== "object") {
    throw new Error("A valid local vault scope is required.");
  }

  const expected = vaultScopeFromOpaqueId(scope.scopeId);
  const fields: readonly (keyof VaultScope)[] = [
    "kind",
    "scopeId",
    "databaseName",
    "databaseKeyName",
    "attachmentKeyName",
    "protectedAttachmentDirectoryName",
    "materializedAttachmentDirectoryName"
  ];
  if (fields.some((field) => scope[field] !== expected[field])) {
    throw new Error("The local vault scope layout is inconsistent.");
  }
  return expected;
}

export function isDevicePreviewVaultScope(scope: VaultScope): boolean {
  return assertValidVaultScope(scope).kind === "device-preview";
}

export function isSignedOutSampleVaultScope(scope: VaultScope): boolean {
  return assertValidVaultScope(scope).kind === "signed-sample";
}
