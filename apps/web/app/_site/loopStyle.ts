// The styles of the figures that keep playing (founder, 26 Oct 2026: motion always on): the
// homepage's How we work cards (HowCards.tsx, how.css), the products frame (SuiteFrame.tsx,
// suite.css) and the product pages' signature figures (LastOne.tsx, PaymentPaper.tsx,
// moment.css). loops.ts puts them in the page's <head> when it starts, so only when motion is
// wanted and the page has hydrated.
//
// Why not in site.css, how.css, suite.css or moment.css, or inline in the HTML: the stylesheets
// block rendering and the HTML is read before the first paint, and Lighthouse's simulation
// charges the homepage's first screen for both (liveStyle.ts has the first measurement; on
// 26 Oct 2026 these rules, about 2.6 KB more HTML with React's copy of them, moved `/`'s
// simulated LCP from 2.42 s to 2.52 s). Nothing here is needed for the first paint: the HTML is
// every figure's finished state, and the Pause controls are `hidden` until loops.ts shows them.
// Every value is a token; each selector keys on its own class or attribute, never on an `:is()`
// list (alyr-design/verify.md, "Style work counts before the first paint").
//
// The cycle: a player's finished state holds while its new words are read (`--loop-hold`: its
// `--words` at `--read-word`, plus `--dwell-beat`, never under `--dwell-min`, so `--pace` tunes
// it), then one element fades out (`loop-out`); loops.ts plays it again and it fades back in
// (`loop-in`, with `is-loop`). Paused (`data-paused`), neither runs and it rests finished.
//
// - How we work: where each scene ends (its last move); the Pause control under Improve.
// - The products frame: where each tile's moment ends; a stagger of 8 beats a tile so the six
//   never fade together; the Pause control at the bar's end, in the room the bar keeps for it.
// - On the homepage (How we work and the products frame) the motion plays like a video
//   (founder, 29 Oct 2026): the Pause control is not on show, only while the pointer is over its
//   figure, with keyboard focus, or while paused (WCAG 2.2.2 keeps a way to stop it).
// - A signature figure: where each moment ends; the Pause control above the end of its label
//   line; played again, the three parts stay where they are (no arrival) and their moments count
//   from the figure's start, on a phone too.

export const LOOP_CSS = `
[data-loop-play]{--loop-hold:max(var(--dwell-min),calc(var(--words,0) * var(--read-word) + var(--dwell-beat)))}
@keyframes loop-out{to{opacity:0}}
@keyframes loop-in{from{opacity:0}}
.loop-toggle{position:absolute;z-index:2;display:inline-flex;align-items:center;gap:.5rem;min-height:2.75rem;padding:0 .75rem;border:0;background:transparent;color:var(--text-muted);font:inherit;font-size:var(--fs-caption);font-weight:var(--weight-medium);cursor:pointer}
.loop-toggle:hover{color:var(--text)}
.loop-toggle[hidden]{display:none}
.loop-toggle>.demo-play,.loop-toggle>.loop-play,[data-paused] .loop-toggle>.demo-pause,[data-paused] .loop-toggle>.loop-pause{display:none}
[data-paused] .loop-toggle>.demo-play,[data-paused] .loop-toggle>.loop-play{display:block}
.hw-check{--hw-end:calc(20 * var(--play-stagger) + var(--play-3))}
.hw-setup{--hw-end:calc(24 * var(--play-stagger) + var(--play-3))}
.hw-see{--hw-end:calc(44 * var(--play-stagger) + var(--play-3))}
.hw-improve{--hw-end:calc(18 * var(--play-stagger) + var(--play-3))}
.hw-toggle{bottom:-2.75rem;inset-inline-end:-.75rem}
.sf .sf-toggle{top:calc((3.5rem - 2.75rem) / 2);inset-inline-end:calc(var(--space-4) - .75rem);color:var(--on-band-quiet)}
.sf .sf-toggle:hover{color:var(--on-band)}
.sf .sf-toggle:focus-visible{outline-color:var(--focus-on-band);outline-offset:-2px}
.hw .hw-toggle,.sf .sf-toggle{opacity:0;transition:opacity var(--dur-2) var(--ease)}
.hw:hover .hw-toggle,.hw .hw-toggle:focus-visible,.hw[data-paused] .hw-toggle,.sf:hover .sf-toggle,.sf .sf-toggle:focus-visible,.sf[data-paused] .sf-toggle{opacity:1}
.sf-chat{--sf-end:calc(11 * var(--play-stagger) + var(--play-3))}
.sf-bookings{--sf-end:calc(14 * var(--play-stagger) + var(--play-3))}
.sf-agent{--sf-end:var(--play-4)}
.sf-accounts{--sf-end:calc(16 * var(--play-stagger) + var(--play-3))}
.sf-shelf{--sf-end:calc(8 * var(--play-stagger) + var(--play-3))}
.sf-docs{--sf-end:calc(19 * var(--play-stagger) + var(--play-3))}
.sig{position:relative}
.lo{--sig-end:calc(32 * var(--play-stagger) + var(--play-3))}
.pf{--sig-end:calc(44 * var(--play-stagger) + var(--play-2))}
.sig-toggle{top:calc(-1 * var(--space-4));inset-inline-end:-.75rem}
.sig.is-again .sig-part{--t0:0}
@media (max-width:47.99rem){.sf .sf-toggle{top:calc((3.25rem - 2.75rem) / 2);inset-inline-end:calc(var(--space-3) - .75rem)}}
@media (prefers-reduced-motion:no-preference){
.motion .hw[data-loop]:not([data-paused]) .hw-card.is-in .hw-scene{animation:loop-out var(--play-3) var(--ease) forwards;animation-delay:calc(var(--hw-d) + var(--hw-end) + var(--loop-hold))}
.motion .hw[data-loop]:not([data-paused]) .hw-card.is-loop .hw-scene{animation:loop-in var(--play-3) var(--ease) both,loop-out var(--play-3) var(--ease) forwards;animation-delay:0s,calc(var(--hw-d) + var(--hw-end) + var(--loop-hold))}
.motion .sf[data-loop]:not([data-paused]) .sf-tile.is-in>.sf-frag{animation:loop-out var(--play-3) var(--ease) forwards;animation-delay:calc(var(--sf-end) + var(--loop-hold) + var(--k,0) * 8 * var(--play-stagger))}
.motion .sf[data-loop]:not([data-paused]) .sf-tile.is-loop>.sf-frag{animation:loop-in var(--play-3) var(--ease) both,loop-out var(--play-3) var(--ease) forwards;animation-delay:0s,calc(var(--sf-end) + var(--loop-hold) + var(--k,0) * 8 * var(--play-stagger))}
.motion .sig[data-loop]:not([data-paused]).is-in>.sig-stage{animation:loop-out var(--play-3) var(--ease) forwards;animation-delay:calc(var(--sig-end) + var(--loop-hold))}
.motion .sig[data-loop]:not([data-paused]).is-loop>.sig-stage{animation:loop-in var(--play-3) var(--ease) both,loop-out var(--play-3) var(--ease) forwards;animation-delay:0s,calc(var(--sig-end) + var(--loop-hold))}
.motion .sig.is-again .sig-part.is-in{animation:none}
}
`;
