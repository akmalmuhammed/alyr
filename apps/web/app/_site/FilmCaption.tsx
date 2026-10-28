import type { CSSProperties } from "react";
import { Icon } from "./brand";

// A caption of the hero film (filmScript.ts, CAPS): mono words on a hairline that ends in a
// tick, the shape of a figure caption, over the window its event is on. Drawn by the server for
// the still's one caption and by FilmCanvas for the rest; no words of its own.

/** A caption: its hairline, its tick and its words (Arabic arrives as one block). */
export function FilmCaption({ k, words, ar }: { k: string; words: string[]; ar: boolean }) {
  return (
    <div className={`hf-cap hf-cap-${k}`}>
      <span className={`hf-cap-line hf-cap-${k}-line`} />
      <span className={`hf-cap-tick hf-cap-${k}-tick`} />
      <span className="hf-cap-words">
        {words.map((word, i) => {
          const sep = word === "·" || word === "→";
          return (
            <span key={i} className={`hf-w${sep ? " is-sep" : i === words.length - 1 ? " is-last" : ""} hf-cap-${k}-w`} style={{ "--w": ar ? 0 : i } as CSSProperties}>
              {word === "→" ? <Icon name="arrow-right" className="ico ico-flip" /> : <bdi>{word}</bdi>}
            </span>
          );
        })}
      </span>
    </div>
  );
}

