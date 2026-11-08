import type { CSSProperties } from "react";
import { Actions, TryFreeNote } from "./Contact";
import { copy, type FlipWords, type Locale } from "./copy";
import { HomeMotion } from "./HomeMotion";
import { LoopToggle } from "./LoopToggle";
import { VideoWindow } from "./VideoWindow";
import { StageTabs } from "./StageTabs";
import { HowStack } from "./HowStack";
import { WorkspaceGrid } from "./WorkspaceGrid";
import { Shell } from "./Shell";
import { TRY_FREE_LIVE } from "./site";
import "./kit.css";
import "./home.css";

/**
 * The ALYR homepage, version 3 (ALY-330, D-157, the founder's brief of 8 Nov 2026, after Notion,
 * Clay and Apple): a centred hero with a window under it for the film (the drawn funnel figure
 * until the film is on); the four stages as a switch (Discover, Convert, Manage, Scale); how we
 * work with you, as panels that stack; one workspace for every kind of business, as a mosaic of
 * every product and what our team does; then the footer and the closing call (the Shell). The
 * price, the questions, the five numbers and the business tabs are off this page (the price is
 * on /pricing). Every word from `copy.ts`; every screen is the product's own, fictional
 * businesses, each marked as a sample once.
 */
export function HomePage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const h = t.home;

  return (
    <Shell locale={locale} page="home" cta={h.final}>
      <Hero locale={locale} />
      <StageTabs locale={locale} words={h.stageTabs} />
      <HowStack locale={locale} words={h.howStack} />
      <WorkspaceGrid locale={locale} words={h.workspaceGrid} />
      <HomeMotion />
    </Shell>
  );
}

const n = (index: number) => ({ "--i": index }) as CSSProperties;

/** A line with one word taking turns (ALY-314). Screen readers get the whole sentence; the drawn
 * line is hidden from them. The words stack in one grid cell, so the line keeps the widest
 * word's width and nothing beside it moves. */
function FlipLine({ className, lead, flip, player = false }: { className: string; lead: string; flip: FlipWords; player?: boolean }) {
  return (
    <p className={className} data-loop-play={player ? "" : undefined} data-flip={player ? "" : undefined}>
      <span className="sr-only">{lead}</span>
      <span aria-hidden="true">
        {flip.before}{" "}
        <span className="flip" data-n={flip.words.length}>
          {flip.words.map((word, index) => (
            <span key={word} className="flip-word" data-rest={index === flip.rest ? "" : undefined} style={n(index)}>
              {word}
            </span>
          ))}
        </span>
        {flip.after}
      </span>
    </p>
  );
}

// ------------------------------------------------------------------------ hero
/* The headline, the line under it and the check-up, on their own (the founder took the film
   out on 7 Nov 2026). The line's changing word has its own Pause (WCAG 2.2.2), as the Office
   line has. */
function Hero({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const hero = t.home.hero;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap">
        <div className="hero-text">
          <h1 className="display hero-title" id="hero-title">
            <span className="hl"><span>{hero.title[0]}</span></span>{" "}
            <span className="hl"><span>{hero.title[1]}</span></span>
          </h1>
          <div className="of hero-flip" data-loop>
            <FlipLine className="hero-lead" lead={hero.lead} flip={hero.flip} player />
            <LoopToggle words={t.loop} name={t.loop.names.line} className="of-toggle" />
          </div>
          <div className={TRY_FREE_LIVE ? "hero-actions is-pair" : "hero-actions"} data-hero-cta>
            <Actions locale={locale} lean label={hero.action} />
            <a className="link hero-more" href="#stages">{hero.more}</a>
          </div>
          {TRY_FREE_LIVE && <TryFreeNote locale={locale} className="hero-note" />}
        </div>
        <VideoWindow locale={locale} />
      </div>
    </section>
  );
}
