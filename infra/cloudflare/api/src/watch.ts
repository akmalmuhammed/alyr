// The outside watcher (ALY-121, spec 022). The Worker's cron already pings the container every
// three minutes to keep it awake; this turns that ping into a check that tells a person when
// the API is down or its job runner is silent, from outside the container, so it still speaks
// when the container itself is dead. Alerts carry check names and status codes only.

export type WatchState = { failures: number; alertedAt: number | null };
export type Verdict = "alert" | "remind" | "clear" | "quiet";

// Two failed checks in a row (about six minutes) before the first message, so one slow start
// does not wake anyone. While it lasts, a reminder every two hours.
const FAILURES_BEFORE_ALERT = 2;
const REMIND_EVERY_MS = 2 * 60 * 60 * 1000;

export const NEW_STATE: WatchState = { failures: 0, alertedAt: null };

export function decide(
  state: WatchState,
  failing: boolean,
  now: number,
): { state: WatchState; verdict: Verdict } {
  if (!failing) {
    const wasAlerting = state.alertedAt !== null;
    return { state: NEW_STATE, verdict: wasAlerting ? "clear" : "quiet" };
  }
  const failures = state.failures + 1;
  if (state.alertedAt === null) {
    if (failures >= FAILURES_BEFORE_ALERT) {
      return { state: { failures, alertedAt: now }, verdict: "alert" };
    }
    return { state: { failures, alertedAt: null }, verdict: "quiet" };
  }
  if (now - state.alertedAt >= REMIND_EVERY_MS) {
    return { state: { failures, alertedAt: now }, verdict: "remind" };
  }
  return { state: { failures, alertedAt: state.alertedAt }, verdict: "quiet" };
}

type Health = { name: string; ok: boolean; note: string };

async function check(
  name: string,
  call: () => Promise<Response>,
): Promise<Health> {
  try {
    const response = await call();
    if (response.ok) return { name, ok: true, note: "" };
    let note = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as Record<string, unknown>;
      // Only the plain words the API gives, never anything else from the body.
      for (const key of ["database", "migrations", "worker"]) {
        const value = body[key];
        if (typeof value === "string" && value !== "ok") note += `, ${key}: ${value}`;
      }
      const queue = body["queue"] as { late?: boolean } | undefined;
      if (queue?.late) note += ", queue late";
    } catch {
      // A body that is not JSON is still a failed check.
    }
    return { name, ok: false, note };
  } catch {
    return { name, ok: false, note: "no answer" };
  }
}

export async function runChecks(
  fetchApi: (path: string) => Promise<Response>,
): Promise<{ failing: boolean; summary: string }> {
  const results = await Promise.all([
    check("ready", () => fetchApi("/health/ready")),
    check("worker", () => fetchApi("/health/worker")),
  ]);
  const bad = results.filter((r) => !r.ok);
  return {
    failing: bad.length > 0,
    summary: bad.map((r) => `${r.name}: ${r.note}`).join("; "),
  };
}

type Settings = Record<string, unknown>;
const text = (env: Settings, name: string) =>
  typeof env[name] === "string" ? (env[name] as string) : "";

export async function tell(env: Settings, title: string, body: string, urgent: boolean) {
  console.error(`ALERT ${title}: ${body}`);
  const topic = text(env, "ALYR_ALERT_NTFY_TOPIC");
  if (topic) {
    try {
      const base = text(env, "ALYR_ALERT_NTFY_URL") || "https://ntfy.sh";
      await fetch(`${base.replace(/\/$/, "")}/${topic}`, {
        method: "POST",
        headers: { Title: title, Priority: urgent ? "urgent" : "default", Tags: urgent ? "rotating_light" : "white_check_mark" },
        body,
      });
    } catch (error) {
      console.error("could not send the push alert", error);
    }
  }
  const to = text(env, "ALYR_ALERT_EMAIL");
  const key = text(env, "ALYR_EMAIL_API_KEY");
  if (to && key) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: text(env, "ALYR_EMAIL_FROM") || "ALYR <no-reply@alyr.qa>",
          to: [to],
          subject: `[ALYR] ${title}`,
          text: body,
        }),
      });
    } catch (error) {
      console.error("could not send the alert email", error);
    }
  }
}
