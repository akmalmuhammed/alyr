// The pure parts of the Answers view (ALY-326, spec 068): which state the view is in, how one
// answer is described, what a change of the settings sends, and how wide a bar is. No React and no
// fetch: `discoveryAnswers.test.mjs` runs these under `node --test`.

import type { AnswerItem, AnswersView, SettingsChange, Tally } from "./discoveryAnswersApi.ts";
import { A } from "./discoveryAnswersCopy.ts";
import type { Lang } from "./lang";

export type AnswersState = "off" | "notAsked" | "asked";

/** Off until it is switched on (even if it was once asked), then "not asked" until a check-up has asked. */
export function answersState(view: AnswersView): AnswersState {
  if (!view.enabled) return "off";
  return view.last ? "asked" : "notAsked";
}

export type AnswerKind = "named" | "notNamed" | "notCounted";

/** What an answer is: named, not named, or not counted because it could not be had. */
export function answerKind(item: AnswerItem): AnswerKind {
  if (item.status === "error") return "notCounted";
  return item.named ? "named" : "notNamed";
}

/** One line on where in the answer the business was named; empty when it was not. */
export function placeText(item: AnswerItem, lang: Lang): string {
  const a = A[lang];
  if (answerKind(item) !== "named") return "";
  if (item.position !== null && item.list_size >= item.position) return a.inList(item.position, item.list_size);
  return a.inSentence;
}

/** How full a share's bar is (0 to 100), or null when there is no number to draw. */
export function barWidth(share: number | null): number | null {
  return share === null || !Number.isFinite(share) ? null : Math.min(100, Math.max(0, Math.round(share)));
}

/** The history of check-ups newest first, as the API sends it; at most `limit`. */
export function recent(history: readonly Tally[], limit = 12): Tally[] {
  return history.slice(0, limit);
}

export type Draft = { trade: string; city: string };

/** What the form starts with: what is saved, else nothing chosen. */
export function draftOf(view: AnswersView): Draft {
  return { trade: view.settings.trade ?? "", city: view.settings.city ?? "" };
}

/** Whether the form differs from what is saved, and holds a choice of each. */
export function canSave(view: AnswersView, draft: Draft): boolean {
  if (!draft.trade || !draft.city) return false;
  return draft.trade !== (view.settings.trade ?? "") || draft.city !== (view.settings.city ?? "");
}

/**
 * The body of the settings call: only keys of the lists, only what was chosen. Switching on sends
 * `enabled` and whatever is chosen; when nothing is chosen the API decides (the sample business knows
 * its own trade and city) or refuses with `needs_trade`, and the screen says so in the API's words.
 */
export function settingsBody(draft: Draft, enabled?: boolean): SettingsChange {
  const body: SettingsChange = {};
  if (enabled !== undefined) body.enabled = enabled;
  if (draft.trade) body.trade = draft.trade;
  if (draft.city) body.city = draft.city;
  return body;
}

/** The names of the competitors of one answer as a line, in the order the answer listed them. */
export function alsoNamedLine(item: AnswerItem): string {
  return item.competitors.join(" · ");
}

/** Whether a check-up is worth following still: the same rule Home uses, kept here for the view. */
export const SLOW_AFTER = 160;
