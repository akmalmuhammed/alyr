import { notFound } from "next/navigation";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { InboxWorkbench, type InboxView } from "@/app/(product)/_workspace/inbox/InboxWorkbench";
import type { Role } from "@/app/(product)/_workspace/inbox/types";

export const metadata = {
  title: "ALYR Inbox Preview",
  robots: { index: false, follow: false },
};

/** The text typed in the drawing's first frame: a reply to Rashid, not sent. */
const DRAWING_DRAFT =
  "Yes, you can. Bring it on Friday before 21:30 and leave the key with Bilal. He starts at 08:00 on Saturday and it will be ready by 12:00.";

const VIEWS: Record<string, InboxView> = { unsent: "unsent", closed: "closed" };
const ROLES = new Set<Role>(["owner", "admin", "agent"]);

/**
 * Development only (404 in production). Every frame of the Inbox on the sample business, or on the real API with
 * `?live=1`. Nothing here sends a message. Parameters: lang, theme, view (unsent | closed), state (loading | empty |
 * firstrun | offline | notsent), window=closed, dialog=close, thread=1 (a phone opens the conversation), tab, chip, q, role.
 */
export default async function InboxPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const lang: UiLang = one(query.lang) === "ar" ? "ar" : "en";
  const theme = one(query.theme) === "dark" ? "dark" : "light";
  const live = one(query.live) === "1" || one(query.live) === "true";
  const state = one(query.state) ?? null;
  const dialog = one(query.dialog) ?? null;
  const view = VIEWS[one(query.view) ?? ""] ?? "conversations";
  const closed = one(query.window) === "closed";
  const role = ROLES.has(one(query.role) as Role) ? (one(query.role) as Role) : undefined;
  const tab = one(query.tab) === "closed" ? "closed" : "open";
  const chip = one(query.chip) as "waiting" | "mine" | "unassigned" | "not_delivered" | "window_closed" | undefined;
  // The States frame's "a search finds nothing": the drawing searches for a misspelling.
  const q = one(query.q) ?? (state === "filtered" ? "ceramc" : "");

  const plain = !live && !dialog && (!state || state === "notsent") && !closed;

  return (
    <UiRoot lang={lang} data-theme={theme}>
      <ToastProvider labels={{ dismiss: lang === "ar" ? "إغلاق" : "Dismiss", undo: lang === "ar" ? "تراجع" : "Undo" }}>
        <InboxWorkbench
          lang={lang}
          live={live}
          role={role}
          view={view}
          state={state}
          dialog={dialog}
          initialFilters={{ tab, chip: chip ?? null, q }}
          initialSelectedId={closed ? "ms-saleh" : live ? null : "rm-148"}
          initialPane={one(query.thread) ? "main" : "list"}
          drafts={plain || one(query.thread) ? { "rm-148": DRAWING_DRAFT } : undefined}
          closeInitial={{ outcome: "lost", reason: "no_reply", note: "Asked for Thursday evening, never picked a slot." }}
        />
      </ToastProvider>
    </UiRoot>
  );
}
