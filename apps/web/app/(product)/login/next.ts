// Where /login sends a person after they sign in. A page that needs a sign-in (the back office
// first) links to `/login?next=/ops/signup`, and the sign-in page goes back there. The value
// comes from the address bar, so anyone can write anything in it: it is used only when it is a
// plain path inside the product's own signed-in areas, and otherwise the person goes to the
// workspace as before. Nothing is decoded a second time and nothing is guessed: a value that
// is not exactly what the pattern allows is refused.

/** What a sign-in lands on when `next` is missing or not safe. */
export const AFTER_SIGN_IN = "/app";

// One slash, then the area (`ops`, `app` or `start`) and optionally more path segments of
// letters, digits, `_` and `-`, optionally followed by a short query of the same plain
// characters. No second slash, no dot, no colon, no `%`, no backslash, no `#`, no spaces.
const SAFE = /^\/(?:ops|app|start)(?:\/[A-Za-z0-9_-]{1,64}){0,6}\/?(?:\?[A-Za-z0-9_=&,-]{0,200})?$/;

/** The page to return to, or null when `next` is absent or not a safe path of this site. */
export function safeNext(next: string | null | undefined): string | null {
  if (typeof next !== "string" || next.length > 400) return null;
  return SAFE.test(next) ? next : null;
}

/** The back office needs a staff check before it can be opened; the workspace and sign-up do not. */
export function isBackOffice(path: string): boolean {
  return path === "/ops" || path.startsWith("/ops/") || path.startsWith("/ops?");
}

/** The sign-in address that comes back to `path`, or plain `/login` when `path` is not safe. */
export function loginUrl(path: string | null | undefined): string {
  const safe = safeNext(path);
  return safe ? `/login?next=${encodeURIComponent(safe).replace(/%2F/g, "/")}` : "/login";
}

/**
 * Where to go once signed in. A back-office page is kept only for ALYR staff: anyone else, who
 * can sign in but would meet a closed door there, goes to the workspace as before. `isStaff`
 * asks the API, so a failed check is also the workspace.
 */
export async function landing(next: string | null | undefined, isStaff: () => Promise<boolean>): Promise<string> {
  const safe = safeNext(next);
  if (!safe) return AFTER_SIGN_IN;
  if (!isBackOffice(safe)) return safe;
  try {
    return (await isStaff()) ? safe : AFTER_SIGN_IN;
  } catch {
    return AFTER_SIGN_IN;
  }
}
