// Putting people, chairs and services in order with up and down buttons (ALY-259, D-143): the
// list as it will be after one step, or as it is when there is no step to take. No React, so
// `bookingsReorder.test.mjs` runs it under Node.

/** The ids with `id` one place earlier ("up") or later ("down"); unchanged at the ends. */
export function reorder(ids: string[], id: string, direction: "up" | "down"): string[] {
  const at = ids.indexOf(id);
  const to = direction === "up" ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}
