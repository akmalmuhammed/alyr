// The parts of the second-factor screens that are not drawing (ALY-125, D-136): reading the API's
// answer, and shaping codes for people. Pure, so `factor.test.mjs` runs them without a browser.

export type Gate = "prompt" | "enrol" | "closed";

type Detail = { code?: unknown; enrolled?: unknown; enrolment_open?: unknown };

/** Whether an answer from the back office means "this is staff, but the second step is not done":
 *  the one 403 that is not a stranger. */
export function isSecondFactorAnswer(status: number, data: unknown): boolean {
  if (status !== 403 || typeof data !== "object" || data === null) return false;
  const detail = (data as { detail?: unknown }).detail;
  return typeof detail === "object" && detail !== null && (detail as Detail).code === "second_factor_required";
}

/** Which screen the door shows: the code prompt for an account with an authenticator, the setup
 *  for one that may enrol, and the closed notice for one that may not. */
export function gateOf(data: unknown): Gate {
  const detail = ((data as { detail?: unknown } | null)?.detail ?? {}) as Detail;
  if (detail.enrolled === true) return "prompt";
  return detail.enrolment_open === true ? "enrol" : "closed";
}

/** The digits of a typed code, at most six: spaces and anything else a phone's keyboard adds go. */
export function digits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

/** A recovery code as typed: letters and digits only, upper case, at most twelve, in groups of
 *  four with a dash, so that a pasted code and a typed one look the same. */
export function recovery(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return raw.replace(/(.{4})(?=.)/g, "$1-");
}

/** A setup key in groups of four, which is how an authenticator app shows it. */
export function groups(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, "$1 ");
}

/** The text file of recovery codes: a line saying what it is, then one code a line. */
export function codesFile(codes: string[], head: string): string {
  return `${head}\n\n${codes.join("\n")}\n`;
}

/** Whole minutes to wait for a `Retry-After` in seconds, at least one. */
export function minutesToWait(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}
