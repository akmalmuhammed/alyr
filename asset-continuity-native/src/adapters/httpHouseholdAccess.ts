import {
  API_ERROR_VERSION,
  CONTRACT_API_VERSION,
  type ApiErrorCode,
  type ContractError,
  type CreateHouseholdRequest,
  type HouseholdAccessPort,
  type HouseholdAccessMutationReceipt,
  type HouseholdAccessSnapshot,
  type HouseholdCreationReceipt,
  type HouseholdInvite,
  type HouseholdMemberDescriptor,
  type HouseholdMembership,
  type PendingHouseholdInviteDescriptor,
  type HouseholdWorkspace,
  type Result
} from "@alyr/contracts";

import type {
  AccessTokenProvider,
  SyncFetch
} from "./httpSyncTransport";

export interface HttpHouseholdAccessOptions {
  readonly baseUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetchImpl?: SyncFetch;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const apiErrorCodes: readonly ApiErrorCode[] = [
  "AUTHENTICATION_REQUIRED",
  "AUTHORIZATION_DENIED",
  "CONFLICT_REQUIRES_REVIEW",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_COMMAND",
  "INVALID_CURSOR",
  "INVALID_FILE",
  "NOT_FOUND",
  "OFFLINE",
  "QUOTA_EXCEEDED",
  "RATE_LIMITED",
  "SESSION_EXPIRED",
  "STORAGE_UNAVAILABLE",
  "UNSUPPORTED_CONTRACT_VERSION",
  "VALIDATION_FAILED"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === "string" &&
    apiErrorCodes.some((candidate) => candidate === value)
  );
}

function parseContractError(value: unknown): ContractError | null {
  const candidate =
    isRecord(value) && isRecord(value.error) ? value.error : value;
  if (
    !isRecord(candidate) ||
    candidate.errorVersion !== API_ERROR_VERSION ||
    !isApiErrorCode(candidate.code) ||
    typeof candidate.message !== "string" ||
    typeof candidate.retryable !== "boolean"
  ) {
    return null;
  }
  return {
    errorVersion: API_ERROR_VERSION,
    code: candidate.code,
    message: candidate.message,
    retryable: candidate.retryable
  };
}

function failure<T>(
  code: ApiErrorCode,
  message: string,
  retryable: boolean
): Result<T> {
  return {
    ok: false,
    error: {
      errorVersion: API_ERROR_VERSION,
      code,
      message,
      retryable
    }
  };
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    value.includes("T")
  );
}

function parseInvite(value: unknown): HouseholdInvite | null {
  if (
    !isRecord(value) ||
    typeof value.inviteId !== "string" ||
    !uuidPattern.test(value.inviteId) ||
    typeof value.oneTimeCode !== "string" ||
    value.oneTimeCode.length < 1 ||
    (value.role !== "editor" && value.role !== "viewer") ||
    !isIsoDateTime(value.expiresAt)
  ) {
    return null;
  }
  return {
    inviteId: value.inviteId,
    oneTimeCode: value.oneTimeCode,
    role: value.role,
    expiresAt: value.expiresAt
  };
}

function parseMembership(value: unknown): HouseholdMembership | null {
  const candidate =
    isRecord(value) && isRecord(value.membership)
      ? value.membership
      : null;
  if (
    candidate === null ||
    typeof candidate.id !== "string" ||
    typeof candidate.household_id !== "string" ||
    typeof candidate.user_id !== "string" ||
    (candidate.role !== "owner" &&
      candidate.role !== "editor" &&
      candidate.role !== "viewer") ||
    (candidate.status !== "active" && candidate.status !== "revoked") ||
    typeof candidate.version !== "number" ||
    !Number.isSafeInteger(candidate.version) ||
    candidate.version < 1
  ) {
    return null;
  }
  return {
    membershipId: candidate.id,
    householdId: candidate.household_id,
    accountId: candidate.user_id,
    role: candidate.role,
    status: candidate.status,
    version: candidate.version
  };
}

function parseHousehold(value: unknown): HouseholdWorkspace | null {
  const candidate = isRecord(value) ? value : null;
  if (
    candidate === null ||
    typeof candidate.id !== "string" ||
    !uuidPattern.test(candidate.id) ||
    typeof candidate.name !== "string" ||
    candidate.name.trim().length < 1 ||
    typeof candidate.version !== "number" ||
    !Number.isSafeInteger(candidate.version) ||
    candidate.version < 1 ||
    !isIsoDateTime(candidate.created_at)
  ) {
    return null;
  }
  return {
    householdId: candidate.id,
    name: candidate.name.trim(),
    version: candidate.version,
    createdAt: candidate.created_at
  };
}

function parseHouseholdCreationReceipt(
  value: unknown,
  expectedOperationId: string,
  expectedHouseholdId: string
): HouseholdCreationReceipt | null {
  if (
    !isRecord(value) ||
    value.operationId !== expectedOperationId ||
    !uuidPattern.test(expectedOperationId)
  ) {
    return null;
  }
  const household = parseHousehold(value.household);
  return household?.householdId === expectedHouseholdId
    ? {
        operationId: expectedOperationId,
        household
      }
    : null;
}

function parseOnboardingCompletion(
  value: unknown
): {
  readonly householdId: string;
  readonly onboarding: "complete";
} | null {
  if (
    !isRecord(value) ||
    typeof value.householdId !== "string" ||
    !uuidPattern.test(value.householdId) ||
    value.onboarding !== "complete"
  ) {
    return null;
  }
  return {
    householdId: value.householdId,
    onboarding: "complete"
  };
}

function parseHouseholdMember(
  value: unknown,
  householdId: string
): HouseholdMemberDescriptor | null {
  if (
    !isRecord(value) ||
    typeof value.membershipId !== "string" ||
    !uuidPattern.test(value.membershipId) ||
    value.householdId !== householdId ||
    typeof value.accountId !== "string" ||
    !uuidPattern.test(value.accountId) ||
    typeof value.displayName !== "string" ||
    value.displayName.trim().length < 1 ||
    value.displayName.length > 320 ||
    !(
      value.email === null ||
      (typeof value.email === "string" &&
        value.email.length <= 320 &&
        value.email.includes("@"))
    ) ||
    (value.role !== "owner" &&
      value.role !== "editor" &&
      value.role !== "viewer") ||
    value.status !== "active" ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    !isIsoDateTime(value.joinedAt) ||
    typeof value.isCurrentUser !== "boolean"
  ) {
    return null;
  }
  return {
    membershipId: value.membershipId,
    householdId,
    accountId: value.accountId,
    displayName: value.displayName.trim(),
    email: value.email,
    role: value.role,
    status: "active",
    version: value.version,
    joinedAt: value.joinedAt,
    isCurrentUser: value.isCurrentUser
  };
}

function parsePendingInvite(
  value: unknown,
  householdId: string
): PendingHouseholdInviteDescriptor | null {
  if (
    !isRecord(value) ||
    typeof value.inviteId !== "string" ||
    !uuidPattern.test(value.inviteId) ||
    value.householdId !== householdId ||
    (value.role !== "editor" && value.role !== "viewer") ||
    value.status !== "pending" ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    !isIsoDateTime(value.createdAt) ||
    !isIsoDateTime(value.expiresAt)
  ) {
    return null;
  }
  return {
    inviteId: value.inviteId,
    householdId,
    role: value.role,
    status: "pending",
    version: value.version,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt
  };
}

function parseAccessSnapshot(value: unknown): HouseholdAccessSnapshot | null {
  const candidate =
    isRecord(value) && isRecord(value.snapshot) ? value.snapshot : value;
  if (
    !isRecord(candidate) ||
    typeof candidate.householdId !== "string" ||
    !uuidPattern.test(candidate.householdId) ||
    typeof candidate.householdName !== "string" ||
    candidate.householdName.trim().length < 1 ||
    candidate.householdName.length > 120 ||
    typeof candidate.householdVersion !== "number" ||
    !Number.isSafeInteger(candidate.householdVersion) ||
    candidate.householdVersion < 1 ||
    typeof candidate.currentMembershipId !== "string" ||
    !uuidPattern.test(candidate.currentMembershipId) ||
    typeof candidate.currentAccountId !== "string" ||
    !uuidPattern.test(candidate.currentAccountId) ||
    (candidate.currentRole !== "owner" &&
      candidate.currentRole !== "editor" &&
      candidate.currentRole !== "viewer") ||
    !Array.isArray(candidate.members) ||
    !Array.isArray(candidate.pendingInvites) ||
    !isIsoDateTime(candidate.refreshedAt)
  ) {
    return null;
  }
  const householdId = candidate.householdId;
  const members = candidate.members.map((member) =>
    parseHouseholdMember(member, householdId)
  );
  const pendingInvites = candidate.pendingInvites.map((invite) =>
    parsePendingInvite(invite, householdId)
  );
  if (
    members.some((member) => member === null) ||
    pendingInvites.some((invite) => invite === null) ||
    members.filter((member) => member?.role === "owner").length !== 1 ||
    members.filter((member) => member?.isCurrentUser).length !== 1 ||
    !members.some(
      (member) =>
        member?.membershipId === candidate.currentMembershipId &&
        member?.accountId === candidate.currentAccountId &&
        member?.role === candidate.currentRole
    )
  ) {
    return null;
  }
  return {
    householdId,
    householdName: candidate.householdName.trim(),
    householdVersion: candidate.householdVersion,
    currentMembershipId: candidate.currentMembershipId,
    currentAccountId: candidate.currentAccountId,
    currentRole: candidate.currentRole,
    members: members as HouseholdMemberDescriptor[],
    pendingInvites: pendingInvites as PendingHouseholdInviteDescriptor[],
    refreshedAt: candidate.refreshedAt
  };
}

function parseMutationResponse(
  value: unknown
): {
  readonly receipt: HouseholdAccessMutationReceipt;
  readonly snapshot: HouseholdAccessSnapshot;
} | null {
  if (
    !isRecord(value) ||
    !isRecord(value.receipt) ||
    typeof value.receipt.operationId !== "string" ||
    !uuidPattern.test(value.receipt.operationId) ||
    (value.receipt.kind !== "membership.role_changed" &&
      value.receipt.kind !== "membership.revoked" &&
      value.receipt.kind !== "invite.cancelled" &&
      value.receipt.kind !== "ownership.transferred")
  ) {
    return null;
  }
  const snapshot = parseAccessSnapshot(value.snapshot);
  if (!snapshot) return null;
  return {
    receipt: {
      operationId: value.receipt.operationId,
      kind: value.receipt.kind
    },
    snapshot
  };
}

export class HttpHouseholdAccess implements HouseholdAccessPort {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: SyncFetch;

  constructor(options: HttpHouseholdAccessOptions) {
    this.baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => globalThis.fetch(input, init));
  }

  async createHousehold(
    request: CreateHouseholdRequest
  ): ReturnType<HouseholdAccessPort["createHousehold"]> {
    const normalizedName = request.name.trim();
    if (
      request.apiVersion !== CONTRACT_API_VERSION ||
      !uuidPattern.test(request.operationId) ||
      !uuidPattern.test(request.householdId) ||
      normalizedName.length < 1 ||
      normalizedName.length > 120
    ) {
      return failure(
        "VALIDATION_FAILED",
        "Enter a valid household creation request.",
        false
      );
    }
    const result = await this.post("/households", {
      apiVersion: CONTRACT_API_VERSION,
      operationId: request.operationId,
      householdId: request.householdId,
      name: normalizedName
    });
    if (!result.ok) return result;
    const receipt = parseHouseholdCreationReceipt(
      result.value,
      request.operationId,
      request.householdId
    );
    return receipt
      ? { ok: true, value: receipt }
      : failure(
          "VALIDATION_FAILED",
          "The household service returned a malformed creation receipt.",
          false
        );
  }

  async completeOnboarding(
    householdId: string
  ): ReturnType<HouseholdAccessPort["completeOnboarding"]> {
    if (!uuidPattern.test(householdId)) {
      return failure(
        "VALIDATION_FAILED",
        "Choose a valid household before completing setup.",
        false
      );
    }
    const result = await this.post("/onboarding/complete", {
      apiVersion: CONTRACT_API_VERSION,
      householdId
    });
    if (!result.ok) return result;
    const completion = parseOnboardingCompletion(result.value);
    return completion
      ? { ok: true, value: completion }
      : failure(
          "VALIDATION_FAILED",
          "The onboarding service returned a malformed response.",
          false
        );
  }

  async createInvite(
    input: Parameters<HouseholdAccessPort["createInvite"]>[0]
  ): Promise<Result<HouseholdInvite>> {
    if (
      !uuidPattern.test(input.householdId) ||
      (input.role !== "editor" && input.role !== "viewer") ||
      !Number.isSafeInteger(input.expiresInHours) ||
      input.expiresInHours < 1 ||
      input.expiresInHours > 720
    ) {
      return failure(
        "VALIDATION_FAILED",
        "Choose a valid household, role and expiry.",
        false
      );
    }

    const result = await this.post("/invites", {
      apiVersion: CONTRACT_API_VERSION,
      householdId: input.householdId,
      role: input.role,
      expiresInHours: input.expiresInHours
    });
    if (!result.ok) return result;
    const invite = parseInvite(result.value);
    return invite
      ? { ok: true, value: invite }
      : failure(
          "VALIDATION_FAILED",
          "The invitation service returned a malformed response.",
          false
        );
  }

  async acceptInvite(
    oneTimeCode: string
  ): Promise<Result<HouseholdMembership>> {
    const normalizedCode = oneTimeCode.trim().toUpperCase();
    if (normalizedCode.length < 1 || normalizedCode.length > 128) {
      return failure(
        "VALIDATION_FAILED",
        "Enter a valid invitation code.",
        false
      );
    }

    const result = await this.post("/invites/accept", {
      apiVersion: CONTRACT_API_VERSION,
      oneTimeCode: normalizedCode
    });
    if (!result.ok) return result;
    const membership = parseMembership(result.value);
    return membership
      ? { ok: true, value: membership }
      : failure(
          "VALIDATION_FAILED",
          "The invitation service returned a malformed response.",
          false
        );
  }

  async getAccessSnapshot(
    householdId: string
  ): ReturnType<HouseholdAccessPort["getAccessSnapshot"]> {
    if (!uuidPattern.test(householdId)) {
      return failure(
        "VALIDATION_FAILED",
        "Choose a valid household before refreshing access.",
        false
      );
    }
    const result = await this.request(
      `/household-access?householdId=${encodeURIComponent(householdId)}`,
      "GET"
    );
    if (!result.ok) return result;
    const snapshot = parseAccessSnapshot(result.value);
    return snapshot
      ? { ok: true, value: snapshot }
      : failure(
          "VALIDATION_FAILED",
          "The household service returned a malformed access roster.",
          false
        );
  }

  async changeMemberRole(
    input: Parameters<HouseholdAccessPort["changeMemberRole"]>[0]
  ): ReturnType<HouseholdAccessPort["changeMemberRole"]> {
    if (
      !uuidPattern.test(input.membershipId) ||
      (input.role !== "editor" && input.role !== "viewer")
    ) {
      return failure(
        "VALIDATION_FAILED",
        "Choose a valid member role.",
        false
      );
    }
    return this.mutateAccess(
      "/household-access/member-role",
      input,
      {
        membershipId: input.membershipId,
        expectedVersion: input.expectedVersion,
        role: input.role
      }
    );
  }

  async revokeMember(
    input: Parameters<HouseholdAccessPort["revokeMember"]>[0]
  ): ReturnType<HouseholdAccessPort["revokeMember"]> {
    if (!uuidPattern.test(input.membershipId)) {
      return failure(
        "VALIDATION_FAILED",
        "Choose a valid active member.",
        false
      );
    }
    return this.mutateAccess(
      "/household-access/member-revoke",
      input,
      {
        membershipId: input.membershipId,
        expectedVersion: input.expectedVersion
      }
    );
  }

  async cancelInvite(
    input: Parameters<HouseholdAccessPort["cancelInvite"]>[0]
  ): ReturnType<HouseholdAccessPort["cancelInvite"]> {
    if (!uuidPattern.test(input.inviteId)) {
      return failure(
        "VALIDATION_FAILED",
        "Choose a valid pending invitation.",
        false
      );
    }
    return this.mutateAccess(
      "/household-access/invite-cancel",
      input,
      {
        inviteId: input.inviteId,
        expectedVersion: input.expectedVersion
      }
    );
  }

  async transferOwnership(
    input: Parameters<HouseholdAccessPort["transferOwnership"]>[0]
  ): ReturnType<HouseholdAccessPort["transferOwnership"]> {
    if (
      !uuidPattern.test(input.targetMembershipId) ||
      input.acknowledgeOwnerTransfer !== true
    ) {
      return failure(
        "VALIDATION_FAILED",
        "Confirm a valid ownership transfer.",
        false
      );
    }
    return this.mutateAccess(
      "/household-access/ownership-transfer",
      input,
      {
        targetMembershipId: input.targetMembershipId,
        expectedOwnerVersion: input.expectedOwnerVersion,
        expectedTargetVersion: input.expectedTargetVersion,
        acknowledgeOwnerTransfer: input.acknowledgeOwnerTransfer
      }
    );
  }

  private async mutateAccess(
    path: string,
    scope: {
      readonly householdId: string;
      readonly operationId: string;
    },
    fields: Readonly<Record<string, unknown>>
  ): Promise<
    Result<{
      readonly receipt: HouseholdAccessMutationReceipt;
      readonly snapshot: HouseholdAccessSnapshot;
    }>
  > {
    if (
      !uuidPattern.test(scope.householdId) ||
      !uuidPattern.test(scope.operationId) ||
      Object.values(fields).some(
        (value) =>
          typeof value === "number" &&
          (!Number.isSafeInteger(value) || value < 1)
      )
    ) {
      return failure(
        "VALIDATION_FAILED",
        "Refresh household access before making this change.",
        false
      );
    }
    const result = await this.post(path, {
      apiVersion: CONTRACT_API_VERSION,
      householdId: scope.householdId,
      operationId: scope.operationId,
      ...fields
    });
    if (!result.ok) return result;
    const parsed = parseMutationResponse(result.value);
    return parsed
      ? { ok: true, value: parsed }
      : failure(
          "VALIDATION_FAILED",
          "The household service returned a malformed administration response.",
          false
        );
  }

  private async post(
    path: string,
    body: Readonly<Record<string, unknown>>
  ): Promise<Result<unknown>> {
    return this.request(path, "POST", body);
  }

  private async request(
    path: string,
    method: "GET" | "POST",
    body?: Readonly<Record<string, unknown>>
  ): Promise<Result<unknown>> {
    let accessToken: string;
    try {
      accessToken = (await this.getAccessToken()).trim();
    } catch {
      return failure(
        "OFFLINE",
        "The household access service could not be reached.",
        true
      );
    }
    if (!accessToken) {
      return failure(
        "AUTHENTICATION_REQUIRED",
        "Sign in before managing household access.",
        false
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...(method === "POST"
            ? { "Content-Type": "application/json" }
            : {})
        },
        ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {})
      });
    } catch {
      return failure(
        "OFFLINE",
        "The household access service could not be reached.",
        true
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text()) as unknown;
    } catch {
      return failure(
        "VALIDATION_FAILED",
        "The household access service returned a malformed response.",
        false
      );
    }

    if (!response.ok) {
      const error = parseContractError(payload);
      return error
        ? { ok: false, error }
        : failure(
            "VALIDATION_FAILED",
            "The household access service returned a malformed error.",
            false
          );
    }
    return { ok: true, value: payload };
  }
}
