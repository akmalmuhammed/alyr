import { Container, getContainer } from "@cloudflare/containers";

// Everything the container needs comes from this Worker's own settings: any binding whose
// name starts with ALYR_ is handed on as an environment variable. Secrets are set with
// `wrangler secret put`, so they never appear in the repository.
type Env = {
  API: DurableObjectNamespace<ApiContainer>;
} & Record<string, unknown>;

const NAME = "main";

// The one header the API trusts for the visitor's address. Whatever a caller sends under this
// name, or as X-Forwarded-For or X-Real-IP (which uvicorn would believe), is thrown away and
// replaced by what Cloudflare saw.
const CLIENT_IP_HEADER = "x-alyr-client-ip";

function withTrustedAddress(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of ["x-forwarded-for", "x-real-ip", CLIENT_IP_HEADER]) headers.delete(name);
  const seen = request.headers.get("cf-connecting-ip");
  if (seen) headers.set(CLIENT_IP_HEADER, seen);
  return new Request(request, { headers });
}

export class ApiContainer extends Container<Env> {
  defaultPort = 8080;
  // Long on purpose: the job runner shares the container and must stay up. The cron below
  // pings it more often than this, so in practice it never sleeps.
  sleepAfter = "24h";
  pingEndpoint = "localhost/health";

  constructor(ctx: ConstructorParameters<typeof Container>[0], env: Env) {
    super(ctx, env);
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith("ALYR_") && typeof value === "string") vars[key] = value;
    }
    this.envVars = {
      ...vars,
      ALYR_ENV: "production",
      // The rate limits read the visitor's address from this header only, and the Worker below
      // is the only thing that writes it (ALY-116).
      ALYR_CLIENT_IP_HEADER: CLIENT_IP_HEADER,
      // The API only queues jobs; the runner in the same container runs them.
      ALYR_JOBS_INLINE: "false",
      PORT: "8080",
    };
  }

  override onError(error: unknown) {
    console.error("api container error", error);
  }
}

// Only these paths reach the container. The portal calls /api/*; /health is for checks.
function reachesApi(path: string): boolean {
  return path === "/health" || path === "/api" || path.startsWith("/api/");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!reachesApi(pathname)) return new Response("Not found", { status: 404 });
    return getContainer(env.API, NAME).fetch(withTrustedAddress(request));
  },

  // Keeps the container awake, and starts it again if it was stopped.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const response = await getContainer(env.API, NAME).fetch(
      new Request("http://container/health"),
    );
    if (!response.ok) console.error("api health check failed", response.status);
  },
} satisfies ExportedHandler<Env>;
