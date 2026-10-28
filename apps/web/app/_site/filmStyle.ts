// The hero film's canvas styles (FilmCanvas.tsx), everything but the still's (film.css): the
// inbox, the chats, the Orders and Stock screens, Bookings, Credit accounts and the lanes'
// names. film.ts writes them into the page with the film's tracks after load, so the first paint
// and the render-blocking CSS carry none of them (the canvas is not drawn before then). Every
// value is a token; the windows' own look is the products frame's (`sf-*`, suite.css).

export const FILM_SCENE_CSS = `
.hf-ib { position: relative; flex: 1; overflow: hidden; }
.hf .hf-ibr { position: absolute; inset-inline: 0; top: 0; height: 54px; align-content: center; transform: translateY(calc(var(--r) * 1px)); }
.hf .sf-row-line.hf-sw { display: grid; }
.hf-chat { position: relative; flex: 1; overflow: hidden; background: var(--d-chat); }
.hf-th { position: absolute; inset: 0; transform: translateY(var(--y)); }
.hf-mr { position: absolute; top: var(--t); inset-inline: 14px; height: var(--h); display: flex; align-items: flex-start; }
.hf-mr.is-out { justify-content: flex-end; }
.hf-mr.is-day, .hf-mr.is-event { justify-content: center; }
.hf-mr > .sf-msg { position: relative; overflow: hidden; }
.hf-day { padding: 2px 10px; background: var(--d-raise); box-shadow: 0 0 0 1px var(--d-hair-2); color: var(--d-ink-2); font-size: var(--ui-caption); font-variant-numeric: tabular-nums; }
.hf-volt-edge { position: absolute; top: 0; inset-inline: 0; height: 3px; background: var(--volt); opacity: 0; }
.hf-oh, .hf-or-in { display: grid; grid-template-columns: 100px 104px 84px minmax(0, 1fr); align-items: center; gap: 12px; padding-inline: var(--space-3); }
.hf-oh { flex: none; height: 32px; border-bottom: 1px solid var(--hair); color: var(--text-muted); font-family: var(--mono); font-size: var(--ui-micro); font-weight: var(--weight-medium); letter-spacing: var(--tracking-label); text-transform: uppercase; }
.hf-rows { position: relative; flex: 1; overflow: hidden; }
.hf-or { position: absolute; inset-inline: 0; top: 0; height: 50px; transform: translateY(var(--y)); }
.hf-or-in { position: relative; height: 100%; border-bottom: 1px solid var(--hair); }
.hf-or-in > :not(.sf-wash) { position: relative; }
.hf-o-n, .hf-o-i { display: grid; gap: 1px; min-width: 0; }
.hf-o-n b { font-weight: var(--weight-semibold); }
.hf-o-n small, .hf-o-i small { color: var(--text-muted); font-size: var(--ui-caption); white-space: nowrap; font-variant-numeric: tabular-nums; }
.hf-o-p { color: var(--text-muted); white-space: nowrap; }
.hf .hf-o-s { display: grid; }
.hf-o-state { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.hf-chip { padding: 1px 6px; box-shadow: inset 0 0 0 1px var(--hair-strong); font-size: var(--ui-caption); font-weight: var(--weight-semibold); white-space: nowrap; }
.hf-chip.is-new { box-shadow: inset 0 0 0 1px var(--text); }
.hf-btn { position: relative; overflow: hidden; padding: 3px 9px; border-radius: var(--radius-control); box-shadow: inset 0 0 0 1px var(--line-strong); font-size: var(--ui-caption); font-weight: var(--weight-semibold); white-space: nowrap; }
.hf-btn > span:last-child { position: relative; }
.hf-press { position: absolute; inset: 0; background: var(--hair-strong); opacity: 0; }
.hf-stock { flex: none; border-bottom: 1px solid var(--hair-strong); }
.hf-digit > .hf-st-1, .hf-st-few { opacity: 0; }
.hf-lg-head { display: flex; justify-content: space-between; gap: var(--space-3); padding: 10px var(--space-3) 0; color: var(--text-muted); font-family: var(--mono); font-size: var(--ui-micro); font-weight: var(--weight-medium); letter-spacing: var(--tracking-label); text-transform: uppercase; }
.hf-lg-head > span + span { letter-spacing: 0; text-transform: none; }
.hf-lg { position: relative; margin-top: 6px; }
.hf-lg-row { position: relative; display: grid; grid-template-columns: 44px 28px minmax(0, 1fr) 44px auto; align-items: center; gap: var(--space-2); height: 36px; padding-inline: var(--space-3); border-top: 1px solid var(--hair); font-size: var(--ui-small); font-variant-numeric: tabular-nums; white-space: nowrap; }
.hf-lg-row > :not(.sf-wash) { position: relative; }
.hf-lg-row > :nth-child(n + 4) { color: var(--text-muted); }
.hf-lg-row b { font-weight: var(--weight-semibold); }
.hf-ink, .hf-volt { position: absolute; inset: 0; display: grid; place-items: center; font-weight: var(--weight-semibold); }
.hf-ink { background: var(--text); color: var(--text-inverse); }
.hf-volt { opacity: 0; }
.hf-bk-630-fill { transform-origin: 0 50%; }
[dir="rtl"] .hf-bk-630-fill { transform-origin: 100% 50%; }
.hf-tick { position: relative; }
.hf-tick-v { position: absolute; inset: -2px; display: grid; place-items: center; padding: 2px; background: var(--volt); color: var(--on-volt); opacity: 0; }
.hf-flag { display: grid; gap: var(--space-1); margin-top: var(--space-2); padding-top: .75rem; border-top: 1px solid var(--hair-strong); }
.hf-flag-k { display: flex; align-items: center; gap: var(--space-2); font-family: var(--mono); font-size: var(--ui-micro); font-weight: var(--weight-medium); letter-spacing: var(--tracking-label); text-transform: uppercase; }
.hf-ring { position: relative; display: grid; place-items: center; width: 1rem; height: 1rem; border-radius: var(--radius-round); box-shadow: inset 0 0 0 1.5px var(--text); }
.hf-ring::after { content: ""; width: 4px; height: 4px; border-radius: var(--radius-round); background: var(--text); }
.hf-ring-v { position: absolute; inset: -2px; border-radius: var(--radius-round); box-shadow: inset 0 0 0 2px var(--volt); background: var(--window); opacity: 0; }
.hf-flag b { font-weight: var(--weight-semibold); }
.hf-flag > span:last-child { color: var(--text-muted); font-size: var(--ui-caption); }
.hf-lanes { position: absolute; inset: 0; opacity: 0; }
.hf-lane { position: absolute; top: 0; inset-inline-start: 0; }
.hf-lane-rule { position: absolute; inset-inline-start: var(--rx); top: var(--ry); width: var(--rw); height: calc(1px * var(--cs)); background: var(--dark-line); }
.hf-lane-tick { position: absolute; inset-inline-start: calc(var(--rx) + var(--rw)); top: calc(var(--ry) - 4px * var(--cs)); width: calc(1px * var(--cs)); height: calc(9px * var(--cs)); background: var(--band-rule); }
.hf-lane-name { display: flex; gap: 7px; font-family: var(--mono); font-size: var(--ui-micro); font-weight: var(--weight-medium); letter-spacing: var(--tracking-label); text-transform: uppercase; line-height: 1.2; white-space: nowrap; }
.hf-lane-name { position: absolute; inset-inline-start: var(--lx); top: var(--ly); transform: scale(var(--cs)); transform-origin: 0 0; color: var(--on-band-quiet); }
.hf-tag { display: inline-flex; gap: 7px; color: var(--on-band); }
.hf-tag i { font-style: normal; color: var(--on-band-faint); }
[lang="ar"] .hf :is(.hf-oh, .hf-lg-head, .hf-flag-k, .hf-lane-name) { font-family: var(--arabic); letter-spacing: 0; text-transform: none; }
[dir="rtl"] .hf-lane-name { transform-origin: 100% 0; }
`;
