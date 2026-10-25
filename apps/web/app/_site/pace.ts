import { motion } from "../_tokens/tokens";

// The pace of the site's timed pieces, for the scripts that time things themselves (the
// business day's fold, the heading splits). CSS reads the same tokens as custom properties
// (`--play-*`, `--play-stagger`, `--read-word`, `--dwell-*`), each already multiplied by
// `--pace`; the values here are multiplied by the same `motion.pace.pace` when the tokens are
// generated. Never write a duration in a timed piece: take one from here or from the CSS.

/** A token's duration ("432ms", "1.2s") in milliseconds. */
export function ms(value: string): number {
  return parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
}

const pace = motion.pace;

/** The timed pieces' durations, in milliseconds, at the site's pace. */
export const PLAY = {
  1: ms(pace["play-1"]),
  2: ms(pace["play-2"]),
  3: ms(pace["play-3"]),
  4: ms(pace["play-4"]),
  stagger: ms(pace["play-stagger"]),
} as const;

/** How many words a visitor reads in a piece of text (whitespace-separated, any language).
 * A step's dwell is its words times `--read-word`, plus `--dwell-beat`, never under
 * `--dwell-min` (the CSS does the sum, so `--pace` tunes it). */
export function words(...texts: (string | undefined)[]): number {
  return texts.reduce((sum, text) => sum + (text ? text.trim().split(/\s+/).filter(Boolean).length : 0), 0);
}
