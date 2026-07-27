import {
  API_ERROR_VERSION,
  type AccountDeletionPort,
  type AccountDeletionReceipt,
  type AccountDeletionRequest,
  type ApiErrorCode,
  type ContractError,
  type Result
} from "@alyr/contracts";

import type {
  AccessTokenProvider,
  SyncFetch
} from "./httpSyncTransport";

export interface HttpAccountDeletionOptions {
  readonly baseUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetchImpl?: SyncFetch;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
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

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.includes("T") &&
    Number.isFinite(Date.parse(value))
  );
}

function isUuidArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((candidate) =>
      typeof candidate === "string" && uuidPattern.test(candidate)
    ) &&
    new Set(value).size === value.length
  );
}

function parseReceipt(value: unknown): AccountDeletionReceipt | null {
  if (
    !isRecord(value) ||
    typeof value.accountId !== "string" ||
    !uuidPattern.test(value.accountId) ||
    !isUuidArray(value.deletedHouseholdIds) ||
    !isUuidArray(value.departedHouseholdIds) ||
    !isIsoDateTime(value.deletedAt)
  ) {
    return null;
  }
  return {
    accountId: value.accountId,
    deletedHouseholdIds: value.deletedHouseholdIds,
    departedHouseholdIds: value.departedHouseholdIds,
    deletedAt: value.deletedAt
  };
}

function validRequest(input: AccountDeletionRequest): boolean {
  return (
    input.apiVersion === 1 &&
    uuidPattern.test(input.expectedAccountId) &&
    uuidPattern.test(input.expectedActiveHouseholdId) &&
    (input.expectedActiveHouseholdRole === "owner" ||
      input.expectedActiveHouseholdRole === "editor" ||
      input.expectedActiveHouseholdRole === "viewer") &&
    input.confirmationEmail.trim().length > 3 &&
    input.confirmationEmail.length <= 320 &&
    input.password.length > 0 &&
    input.password.length <= 128 &&
    input.acknowledgeIrreversibleDeletion === true
  );
}

export class HttpAccountDeletion implements AccountDeletionPort {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: SyncFetch;

  constructor(options: HttpAccountDeletionOptions) {
    this.baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => globalThis.fetch(input, init));
  }

  async deleteAccount(
    input: AccountDeletionRequest
  ): Promise<Result<AccountDeletionReceipt>> {
    if (!validRequest(input)) {
      return failure(
        "VALIDATION_FAILED",
        "Confirm the account, household, password and irreversible deletion acknowledgement.",
        false
      );
    }

    let accessToken: string;
    try {
      accessToken = (await this.getAccessToken()).trim();
    } catch {
      return failure(
        "OFFLINE",
        "The account service could not be reached.",
        true
      );
    }
    if (!accessToken) {
      return failure(
        "AUTHENTICATION_REQUIRED",
        "Sign in again before deleting this account.",
        false
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/account/deletion`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(input)
        }
      );
    } catch {
      return failure(
        "OFFLINE",
        "The account service could not be reached.",
        true
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text()) as unknown;
    } catch {
      return failure(
        "VALIDATION_FAILED",
        "The account service returned a malformed response.",
        false
      );
    }

    if (!response.ok) {
      const error = parseContractError(payload);
      return error
        ? { ok: false, error }
        : failure(
            "VALIDATION_FAILED",
            "The account service returned a malformed error.",
            false
          );
    }

    const receipt = parseReceipt(payload);
    if (!receipt || receipt.accountId !== input.expectedAccountId) {
      return failure(
        "VALIDATION_FAILED",
        "The account service returned a malformed deletion acknowledgement.",
        false
      );
    }
    return { ok: true, value: receipt };
  }
}
