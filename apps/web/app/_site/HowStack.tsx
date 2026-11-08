import type { CSSProperties } from "react";
import { copy, type Locale } from "./copy";
import type { HowStackCopy } from "./copyHowStack";
import { HOW_SCENES } from "./HowCards";
import { HowStackPlay } from "./HowStackPlay";
import { rich } from "./Text";
import "./howstack.css";

// "How we work with you" as a deck (ALY-330, founder 8 Nov 2026, after Clay's stacking
// sections): four large soft panels, one per step, each sticky a little lower than the one
// before, so the next slides up and covers the last. Each has a small chip, a headline whose
// second line is set apart, two lines, and one drawn scene of the product (the four scenes
// of HowCards.tsx, for the fictional Qirfa Bakery) in its own inset at the inline end.
//
// The stack is CSS (howstack.css): plain `position: sticky` everywhere from 48rem up, and on
// a phone plain stacked cards. Where scroll-driven animation exists and motion is wanted, the
// panel that is being covered also settles back a little. Without scripts everything is on
// the page, finished. Each scene plays once, when its panel comes into view (HowStackPlay),
// and a press on the inset plays it again; with reduced motion only the finished scene shows.
//
// The HTML is every scene's finished state; the figure set holds one "Sample" mark (in the
// check-up sheet) and a sentence for screen readers that the bakery is fictional.

export function HowStack({ locale, words }: { locale: Locale; words: HowStackCopy }) {
  const t = copy[locale];
  const scenes = t.home.how.scenes;
  return (
    <section id="how" className="hs hk" aria-labelledby="how-title">
      <div className="wrap">
        <header className="hk-head">
          <h2 id="how-title" className="h2">{words.title}</h2>
          <p className="lead">{words.lead}</p>
        </header>
        {/* for screen readers and crawlers, before any number: the business is fictional */}
        <p className="sr-only">{t.agent.samples.bakery.fictional}</p>
        <ol className="hk-stack" aria-label={words.listLabel}>
          {words.steps.map((step, index) => {
            const Scene = HOW_SCENES[step.id];
            const scene = scenes[step.id];
            const label = step.id === "check" ? words.check.label : scenes[step.id].label;
            return (
              <li key={step.id} className={`hk-card${index % 2 ? " hk-carbon" : ""}`} style={{ "--i": index } as CSSProperties} data-hk-card>
                <div className="hk-text">
                  <span className="hk-tag">{step.tag}</span>
                  {/* the headline's second line is the one set apart */}
                  <h3 className="hk-title">
                    <span className="hk-l1">{rich(step.lead)}</span>{" "}
                    <span className="hk-l2">{rich(step.mark)}</span>
                  </h3>
                  <p className="hk-body">{rich(step.body)}</p>
                </div>
                <div className={`hw hw-card hw-${step.id} hk-vis`} data-hk-vis>
                  <div className="hw-canvas">
                    <div className="hw-scene" inert aria-hidden="true" data-nosnippet>
                      <Scene locale={locale} title={step.id === "check" ? words.check.title : undefined} />
                    </div>
                    {/* the whole inset plays its scene again: a press, a click or the keyboard */}
                    <button type="button" className="hw-play" aria-label={scene.replay} aria-describedby={`hk-${step.id}-say`} data-hk-play />
                  </div>
                  <p className="sr-only" id={`hk-${step.id}-say`}>{label}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="hk-note">{rich(words.note)}</p>
      </div>
      <HowStackPlay />
    </section>
  );
}
