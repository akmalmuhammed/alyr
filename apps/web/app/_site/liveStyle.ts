// The live Agent figure's styles (D-058; `alyr-design/motion.md`, "The one exception"),
// drawn by AgentFigure as one <style> that React puts in the page's <head>.
//
// Why inline and not in agentfig.css or agent.css: those two are render-blocking stylesheets,
// and Lighthouse's simulation charges the homepage's first screen about 150 ms of LCP once
// they grow by a couple of hundred bytes (measured 25 Oct 2026: padding agent.css's built file
// by 240 compressed bytes of comment alone moved LCP from 2.50 s to 2.63 s). Inline, the rules
// cost the page no request. Every value is a token; selectors are written out, one key class
// each (alyr-design/verify.md, "Style work counts before the first paint").
//
// The dashboard's part (`.ag-…`) styles `AgentDashboard`'s `live` mode, which only this figure
// sets; the workspace never loads it.

export const LIVE_CSS = `
.ag-room{display:grid}
.ag-room>.ag-summary{grid-area:1/1}
.ag-room-ghost{visibility:hidden}
.ag.is-live .ag-word{white-space:nowrap}
.ag.is-live .ag-roll{display:inline-block;position:relative}
.ag.is-live .ag-roll-out{position:absolute;inset-block-start:0;inset-inline-start:0;white-space:nowrap;pointer-events:none}
.af-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;min-width:0}
.af-pause{display:inline-grid;place-items:center;flex:none;width:2.75rem;height:2.75rem;margin-block:-.375rem;margin-inline-end:-.75rem;padding:0;border:0;border-radius:0;background:transparent;color:var(--concrete);cursor:pointer}
.af-pause:hover{color:var(--on-band)}
.af-pause:focus-visible{outline:var(--focus-width) solid var(--focus-on-band);outline-offset:calc(var(--focus-offset) * -1)}
.afig:not([data-live]) .af-pause{visibility:hidden}
.af-view{position:relative}
.afig[data-live] .af-list:not(.af-live){opacity:0}
.af-list.af-live{position:absolute;inset:0;display:block;border:0}
.af-live>.af-item{position:absolute;top:0;left:0;right:auto}
.af-live[data-column]>.af-item{box-shadow:0 1px 0 var(--dark-line)}
.af-live>.af-item[data-out]{opacity:0}
.afig[data-live] .af-live,.afig[data-live] .ag-summary,.afig[data-live] .ag-eyebrow,.afig[data-live] .ag-roll,.afig[data-live] .ag-need small,.afig[data-live] .ag-caption,.afig[data-live] .ag-day.is-today .ag-bar,.afig[data-live] .ag-booked{transition:opacity var(--dur-3) var(--ease)}
.afig[data-reset="out"] .af-live,.afig[data-reset="out"] .ag-summary,.afig[data-reset="out"] .ag-eyebrow,.afig[data-reset="out"] .ag-roll,.afig[data-reset="out"] .ag-need small,.afig[data-reset="out"] .ag-caption,.afig[data-reset="out"] .ag-day.is-today .ag-bar,.afig[data-reset="out"] .ag-booked{opacity:0}
@media (prefers-reduced-motion:no-preference){
.motion .afig-hero .af-view{animation:hp-fade var(--dur-3) var(--ease) both calc(var(--dur-3) + var(--stagger) * 2)}
.af-live>.af-item{transition:translate var(--dur-3) var(--ease),opacity var(--dur-3) var(--ease)}
.af-live>.af-item.is-new{animation:af-enter var(--dur-3) var(--ease) both}
.af-live>.af-item.is-new .af-tick{animation:af-pop var(--dur-3) var(--spring) both var(--stagger)}
.ag.is-live .ag-roll-in{display:inline-block;animation:ag-roll-in var(--dur-3) var(--ease) both}
.ag.is-live .ag-roll-out{animation:ag-roll-out var(--dur-3) var(--ease) both}
.ag.is-live .ag-fade-in{animation:ag-fade-in var(--dur-4) var(--ease) both}
.ag.is-live .ag-roll[data-mark]::after{content:"";position:absolute;inset-inline:0;inset-block-end:-.2em;height:2px;background:var(--ag-volt);animation:ag-mark-on var(--dur-3) var(--ease) both,ag-mark-off var(--dur-4) var(--ease) calc(var(--dur-4) * 3) forwards}
.ag.is-live .ag-bar.ag-grow,.ag.is-live .ag-booked.ag-grow{transform-origin:bottom;animation:ag-grow var(--dur-4) var(--ease) both}
}
@media (prefers-reduced-motion:reduce){.ag.is-live .ag-roll-out{display:none}}
@keyframes af-enter{from{opacity:0;transform:translateY(calc(var(--travel) * -.5))}}
@keyframes af-pop{from{scale:0}}
@keyframes ag-roll-in{from{opacity:0;translate:0 .45em}}
@keyframes ag-roll-out{to{opacity:0;translate:0 -.45em}}
@keyframes ag-fade-in{from{opacity:0}}
@keyframes ag-mark-on{from{opacity:0}}
@keyframes ag-mark-off{to{opacity:0}}
@keyframes ag-grow{from{scale:1 var(--from,1)}}
`;
