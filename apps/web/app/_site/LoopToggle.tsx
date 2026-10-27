/** The pause control of a figure that keeps playing by itself (`loops.ts`; WCAG 2.2.2;
 * founder, 26 Oct 2026: motion always on). `hidden` in the HTML, so without scripts or with
 * reduced motion there is none; loops.ts shows it once its figure plays. It is placed out of
 * the flow (loopStyle.ts), over room its figure keeps for it, so showing it moves nothing.
 * The word on it and its full name come from copy (`loop`); loops.ts swaps the name, the CSS
 * the word. */
export function LoopToggle({ words, name, className }: {
  words: { pause: string; play: string };
  name: { pause: string; play: string };
  className?: string;
}) {
  return (
    <button type="button" className={`loop-toggle${className ? ` ${className}` : ""}`} aria-label={name.pause}
      data-loop-toggle data-pause={name.pause} data-play={name.play} hidden>
      <span className="demo-pause" aria-hidden="true" />
      <span className="demo-play" aria-hidden="true" />
      <span className="loop-pause">{words.pause}</span>
      <span className="loop-play">{words.play}</span>
    </button>
  );
}
