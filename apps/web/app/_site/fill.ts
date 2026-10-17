/** Puts values into a sentence from `copy.ts`, so word order stays with the words.
 * Its own module so client components can use it without bundling all the copy. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
