import { Container, getContainer } from "@cloudflare/containers";
import { NEW_STATE, decide, runChecks, tell, type Verdict, type WatchState } from "./watch";

// Everything the container needs comes from this Worker's own settings: any binding whose
// name starts with ALYR_ is handed on as an environment variable. Secrets are set with
// `wrangler secret put`, so they never appear in the repository.
type Env = {
  API: DurableObjectNamespace<ApiContainer>;
} & Record<string, unknown>;

const NAME = "main";

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
      // The API only queues jobs; the runner in the same container runs them.
      ALYR_JOBS_INLINE: "false",
      PORT: "8080",
    };
  }

  override onError(error: unknown) {
    console.error("api container error", error);
  }

  // The watcher's memory (ALY-121): how many checks in a row failed, and when a person was last
  // told. It lives here, in the container's own storage, so it survives a Worker restart.
  async noteHealth(failing: boolean): Promise<Verdict> {
    const saved = (await this.ctx.storage.get<WatchState>("watch")) ?? NEW_STATE;
    const { state, verdict } = decide(saved, failing, Date.now());
    await this.ctx.storage.put("watch", state);
    return verdict;
  }
}

// Only these paths reach the container. The portal calls /api/*; /health is for checks.
function reachesApi(path: string): boolean {
  return (
    path === "/health" ||
    path === "/health/ready" ||
    path === "/health/worker" ||
    path === "/api" ||
    path.startsWith("/api/")
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!reachesApi(pathname)) return new Response("Not found", { status: 404 });
    return getContainer(env.API, NAME).fetch(request);
  },

  // Keeps the container awake, and starts it again if it was stopped. Then checks that it is
  // ready and that its job runner is alive, and tells a person if not (ALY-121).
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const container = getContainer(env.API, NAME);
    const awake = await container.fetch(new Request("http://container/health")).catch(() => null);
    if (!awake?.ok) console.error("api health check failed", awake?.status);

    const { failing, summary } = await runChecks((path) =>
      container.fetch(new Request(`http://container${path}`)),
    );
    let verdict: Verdict;
    try {
      verdict = await container.noteHealth(failing);
    } catch (error) {
      // The memory failed: say so rather than stay silent about a real failure.
      console.error("could not read the watcher's memory", error);
      verdict = failing ? "alert" : "quiet";
    }
    if (verdict === "alert") await tell(env, "ALYR API is not healthy", summary, true);
    else if (verdict === "remind") await tell(env, "Still: ALYR API is not healthy", summary, true);
    else if (verdict === "clear") await tell(env, "Cleared: ALYR API is healthy again", "Both checks pass.", false);
  },
} satisfies ExportedHandler<Env>;
