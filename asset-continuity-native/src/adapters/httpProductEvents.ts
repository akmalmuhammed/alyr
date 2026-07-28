import { validateAnalyticsEvent } from "@alyr/analytics";
import {
  API_ERROR_VERSION,
  CONTRACT_API_VERSION,
  type ApiErrorCode,
  type ContractError,
  type Result
} from "@alyr/contracts";

import type {
  ProductEventTransport,
  QueuedAnalyticsEvent
} from "@/analytics/types";

export interface HttpProductEventOptions {
  readonly baseUrl: string;
  readonly householdId: string;
  readonly getAccessToken: () => Promise<string>;
  readonly fetchImpl?: (
    url: string,
    init: RequestInit
  ) => Promise<Response>;
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
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value)
  );
}

function contractError(value: unknown): ContractError | null {
  const candidate =
    isRecord(value) && isRecord(value.error) ? value.error : value;
  if (!isRecord(candidate)) return null;
  if (
    candidate.errorVersion !== API_ERROR_VERSION ||
    typeof candidate.code !== "string" ||
    !apiErrorCodes.includes(candidate.code as ApiErrorCode) ||
    typeof candidate.message !== "string" ||
    typeof candidate.retryable !== "boolean"
  ) {
    return null;
  }
  return candidate as unknown as ContractError;
}

function failure(
  code: ApiErrorCode,
  message: string,
  retryable: boolean
): Result<void, ContractError> {
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

/**
 * User-authenticated Edge transport. Household routing and the retry UUID are
 * protocol fields; neither is copied into the allow-listed analytics payload.
 */
export class HttpProductEventTransport
  implements ProductEventTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: NonNullable<
    HttpProductEventOptions["fetchImpl"]
  >;

  constructor(private readonly options: HttpProductEventOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async record(
    entry: Pick<QueuedAnalyticsEvent, "idempotencyKey" | "event">
  ): Promise<Result<void, ContractError>> {
    const privacyErrors = validateAnalyticsEvent(entry.event);
    if (
      privacyErrors.length > 0 ||
      !uuidPattern.test(this.options.householdId) ||
      !uuidPattern.test(entry.idempotencyKey)
    ) {
      return failure(
        "VALIDATION_FAILED",
        "The product event did not match the privacy-safe contract.",
        false
      );
    }

    let bearer: string;
    try {
      bearer = await this.options.getAccessToken();
    } catch {
      return failure(
        "SESSION_EXPIRED",
        "Sign in again before sending product events.",
        true
      );
    }
    if (!bearer) {
      return failure(
        "AUTHENTICATION_REQUIRED",
        "Sign in before sending product events.",
        true
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/product-events`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          apiVersion: CONTRACT_API_VERSION,
          householdId: this.options.householdId,
          idempotencyKey: entry.idempotencyKey,
          eventName: entry.event.name,
          properties: entry.event.payload
        })
      });
    } catch {
      return failure(
        "OFFLINE",
        "The product event service could not be reached.",
        true
      );
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // The response is validated below without exposing its raw body.
    }
    if (!response.ok) {
      return {
        ok: false,
        error:
          contractError(body) ??
          {
            errorVersion: API_ERROR_VERSION,
            code:
              response.status === 401
                ? "SESSION_EXPIRED"
                : response.status === 403
                  ? "AUTHORIZATION_DENIED"
                  : response.status === 409
                    ? "IDEMPOTENCY_CONFLICT"
                    : "STORAGE_UNAVAILABLE",
            message: "The product event was not acknowledged.",
            retryable:
              response.status >= 500 ||
              response.status === 401 ||
              response.status === 429
          }
      };
    }
    if (
      !isRecord(body) ||
      body.apiVersion !== CONTRACT_API_VERSION ||
      body.accepted !== true ||
      body.idempotencyKey !== entry.idempotencyKey ||
      Object.keys(body).some(
        (key) =>
          !["apiVersion", "accepted", "idempotencyKey"].includes(key)
      )
    ) {
      return failure(
        "VALIDATION_FAILED",
        "The product event service returned a malformed acknowledgement.",
        false
      );
    }
    return { ok: true, value: undefined };
  }
}
