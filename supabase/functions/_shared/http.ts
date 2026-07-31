export const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export type ApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "CONFLICT_REQUIRES_REVIEW"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_COMMAND"
  | "INVALID_CURSOR"
  | "INVALID_FILE"
  | "NOT_FOUND"
  | "OFFLINE"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "SESSION_EXPIRED"
  | "STORAGE_UNAVAILABLE"
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "VALIDATION_FAILED";

export type ApiError = {
  error: {
    errorVersion: 1;
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
  };
};

export function json(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status = 400,
  retryable = false,
): Response {
  const effectiveRetryable = code === "QUOTA_EXCEEDED"
    ? false
    : retryable;
  return json(
    {
      error: {
        errorVersion: 1,
        code,
        message,
        retryable: effectiveRetryable,
      },
    } satisfies ApiError,
    status,
  );
}
