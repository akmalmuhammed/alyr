import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.8";

export type RateLimitPolicy = {
  readonly routeGroup: string;
  readonly limit: number;
  readonly windowSeconds: number;
};

export type RateLimitResult =
  | {
      readonly ok: true;
      readonly remaining: number;
    }
  | {
      readonly ok: false;
      readonly retryAfterSeconds: number;
      readonly unavailable?: boolean;
    };

const localBrowserOrigins = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8081",
  "http://localhost:8081",
]);

const authenticatedPolicies: ReadonlyArray<{
  readonly matches: (method: string, path: string) => boolean;
  readonly policy: RateLimitPolicy;
}> = [
  {
    matches: (method, path) => method === "POST" && path === "/sync/push",
    policy: { routeGroup: "sync.push", limit: 120, windowSeconds: 60 },
  },
  {
    matches: (method, path) => method === "GET" && path === "/sync/pull",
    policy: { routeGroup: "sync.pull", limit: 240, windowSeconds: 60 },
  },
  {
    matches: (method, path) =>
      method === "GET" && path === "/household-storage",
    policy: {
      routeGroup: "household.storage.read",
      limit: 60,
      windowSeconds: 60,
    },
  },
  {
    matches: (_method, path) => path.startsWith("/uploads/"),
    policy: { routeGroup: "uploads", limit: 30, windowSeconds: 60 },
  },
  {
    matches: (method, path) => method === "POST" && path === "/exports",
    policy: { routeGroup: "exports.create", limit: 12, windowSeconds: 3600 },
  },
  {
    matches: (method, path) =>
      method === "POST" && path === "/account/deletion",
    policy: { routeGroup: "account.delete", limit: 3, windowSeconds: 3600 },
  },
];

const publicPolicies = new Map<string, RateLimitPolicy>([
  [
    "POST /signup/preflight",
    { routeGroup: "signup.preflight", limit: 8, windowSeconds: 600 },
  ],
  [
    "POST /pilot/preflight",
    { routeGroup: "pilot.preflight", limit: 5, windowSeconds: 600 },
  ],
  [
    "POST /invites/preflight",
    { routeGroup: "invites.preflight", limit: 10, windowSeconds: 600 },
  ],
  [
    "POST /maintenance/exports",
    { routeGroup: "maintenance.exports", limit: 20, windowSeconds: 60 },
  ],
  [
    "POST /maintenance/blobs",
    { routeGroup: "maintenance.blobs", limit: 20, windowSeconds: 60 },
  ],
  [
    "POST /maintenance/sync",
    { routeGroup: "maintenance.sync", limit: 20, windowSeconds: 60 },
  ],
  [
    "POST /maintenance/readiness",
    { routeGroup: "maintenance.readiness", limit: 12, windowSeconds: 60 },
  ],
]);

const sharedNetworkPolicies: ReadonlyArray<{
  readonly matches: (method: string, path: string) => boolean;
  readonly policy: RateLimitPolicy;
}> = [
  {
    matches: (method, path) => method === "POST" && path === "/sync/push",
    policy: {
      routeGroup: "network.authenticated.sync.push",
      limit: 1_200,
      windowSeconds: 60,
    },
  },
  {
    matches: (method, path) => method === "GET" && path === "/sync/pull",
    policy: {
      routeGroup: "network.authenticated.sync.pull",
      limit: 2_400,
      windowSeconds: 60,
    },
  },
  {
    matches: (method, path) =>
      method === "GET" && path === "/household-storage",
    policy: {
      routeGroup: "network.authenticated.household.storage.read",
      limit: 600,
      windowSeconds: 60,
    },
  },
  {
    matches: (_method, path) => path.startsWith("/uploads/"),
    policy: {
      routeGroup: "network.authenticated.uploads",
      limit: 300,
      windowSeconds: 60,
    },
  },
];

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search) {
      return null;
    }
    if (url.hash || !["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function configuredBrowserOrigins(
  configured: string | undefined,
): ReadonlySet<string> {
  const origins = new Set(localBrowserOrigins);
  for (const candidate of (configured ?? "").split(",")) {
    const normalized = normalizeOrigin(candidate.trim());
    if (normalized) origins.add(normalized);
  }
  return origins;
}

export function browserOriginAllowed(
  request: Request,
  configured: string | undefined,
): boolean {
  const origin = request.headers.get("Origin");
  // Native clients and server-to-server maintenance requests do not send an
  // Origin header. Browser callers must match an explicit allow-list entry.
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return normalized !== null &&
    configuredBrowserOrigins(configured).has(normalized);
}

export function networkScope(request: Request): string {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const value of candidates) {
    const normalized = value?.trim().toLowerCase();
    if (
      normalized &&
      normalized.length <= 64 &&
      /^[0-9a-f:.]+$/u.test(normalized)
    ) {
      return `ip:${normalized}`;
    }
  }
  // A shared fail-safe bucket limits requests when the trusted gateway does not
  // provide an address; never trust or persist arbitrary header text.
  return "ip:unknown";
}

export function publicRateLimitPolicy(
  method: string,
  path: string,
): RateLimitPolicy {
  const normalizedMethod = method.toUpperCase();
  const publicPolicy = publicPolicies.get(`${normalizedMethod} ${path}`);
  if (publicPolicy) return publicPolicy;
  return sharedNetworkPolicies.find(({ matches }) =>
    matches(normalizedMethod, path)
  )?.policy ?? {
    // Authenticated requests receive a second, actor-specific limiter after
    // token verification. Keep this pre-auth network ceiling high enough that
    // carrier/corporate NAT does not make unrelated users share 120 requests.
    routeGroup: "network.authenticated-or-unknown",
    limit: 600,
    windowSeconds: 60,
  };
}

export function authenticatedRateLimitPolicy(
  method: string,
  path: string,
): RateLimitPolicy {
  return authenticatedPolicies.find(({ matches }) =>
    matches(method.toUpperCase(), path)
  )?.policy ?? {
    routeGroup: "user.default",
    limit: 180,
    windowSeconds: 60,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function consumeRateLimit(
  serviceClient: SupabaseClient,
  scope: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const scopeHash = await sha256Hex(scope);
  const { data, error } = await serviceClient.rpc("consume_api_rate_limit", {
    p_scope_hash: scopeHash,
    p_route_group: policy.routeGroup,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  });
  if (error || !Array.isArray(data) || data.length !== 1) {
    return { ok: false, retryAfterSeconds: 30, unavailable: true };
  }

  const decision = data[0] as {
    allowed?: unknown;
    remaining?: unknown;
    retry_after_seconds?: unknown;
  };
  if (decision.allowed === true) {
    return {
      ok: true,
      remaining: Math.max(Number(decision.remaining) || 0, 0),
    };
  }
  if (decision.allowed === false) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        Number(decision.retry_after_seconds) || 1,
        1,
      ),
    };
  }
  return { ok: false, retryAfterSeconds: 30, unavailable: true };
}

export function requestId(request: Request): string {
  const proposed = request.headers.get("x-request-id")?.trim();
  if (
    proposed &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(proposed)
  ) {
    return proposed.toLowerCase();
  }
  return crypto.randomUUID();
}

export function withOperationalHeaders(
  response: Response,
  id: string,
  request: Request,
  configuredOrigins: string | undefined,
): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  if (origin && browserOriginAllowed(request, configuredOrigins)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.append("Vary", "Origin");
  }
  headers.set("X-Request-Id", id);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function logRequestCompletion(input: {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
}): void {
  console.log(JSON.stringify({
    event: "api.request.completed",
    requestId: input.id,
    method: input.method,
    path: input.path,
    status: input.status,
    durationMs: Math.max(Math.round(input.durationMs), 0),
  }));
}
