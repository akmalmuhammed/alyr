// What the connection screens share: a refusal from the API as a sentence in the person's
// language, and copying a secret.

import { ApiError } from "./catalogApi";
import type { ConnectCopy, Lang } from "./connectCopy";

export function say(error: unknown, lang: Lang, c: ConnectCopy): string {
  if (!(error instanceof ApiError)) return c.failed;
  if (error.code === "offline") return lang === "ar" ? "لا يوجد اتصال. حاول مجدداً." : "No connection. Try again.";
  const ar = (error as ApiError & { ar?: string }).ar;
  if (lang === "ar") return ar || c.failed;
  return error.message && error.message.length < 300 ? error.message : c.failed;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
