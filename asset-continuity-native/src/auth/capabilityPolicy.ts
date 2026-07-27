import {
  ROLE_CAPABILITIES,
  type HouseholdRole,
  type PermissionCapability
} from "@alyr/contracts";

const VALID_ROLES = new Set<HouseholdRole>([
  "owner",
  "editor",
  "viewer"
]);

const CAPABILITIES_BY_ROLE: Readonly<
  Record<HouseholdRole, ReadonlySet<PermissionCapability>>
> = {
  owner: new Set(ROLE_CAPABILITIES.owner),
  editor: new Set(ROLE_CAPABILITIES.editor),
  viewer: new Set(ROLE_CAPABILITIES.viewer)
};

export class PermissionDeniedError extends Error {
  readonly code = "AUTHORIZATION_DENIED" as const;
  readonly capability: PermissionCapability;

  constructor(capability: PermissionCapability) {
    super(
      `Your current household role does not allow ${capability}. Nothing was saved.`
    );
    this.name = "PermissionDeniedError";
    this.capability = capability;
  }
}

/**
 * The single client capability decision. Unknown, missing, or stale roles are
 * denied rather than inferred from local workspace membership records.
 */
export function hasHouseholdCapability(
  role: HouseholdRole | null | undefined,
  capability: PermissionCapability
): boolean {
  if (!role || !VALID_ROLES.has(role)) return false;
  return CAPABILITIES_BY_ROLE[role].has(capability);
}

export function requireHouseholdCapability(
  role: HouseholdRole | null | undefined,
  capability: PermissionCapability
): void {
  if (!hasHouseholdCapability(role, capability)) {
    throw new PermissionDeniedError(capability);
  }
}

export function requireHouseholdCapabilities(
  role: HouseholdRole | null | undefined,
  capabilities: readonly PermissionCapability[]
): void {
  for (const capability of capabilities) {
    requireHouseholdCapability(role, capability);
  }
}
