# 04 · Build log: the site audit's UX and agent-experience fixes

ALY-223. Builder: the Site and brand lane, worktree `D:\alyr-ux`, branch `aly-site-audit-fixes`,
cut from `aly-210-tech-team-homepage` at c22a5e0 (what is live, PR #105). Dev server port 3115;
static servers 3116 (the baseline `out-site`) and 3117 (this branch); Edge profile
`C:\t\uxfixprof`. Probes and the measuring scripts live outside the repo in `C:\t\uxfix`.

Order of authority: `CLAUDE.md`'s hard rules, `00-decisions.md` (the founder, 24 Oct), then
`01-ux.md` and `03-ax.md`, then the skills.

## Baseline (c22a5e0, built here with `build-site.sh`, served compressed)

Page heights in px, light, after a full scroll (the audit's probe). They match the live
measurements in `01-ux.md`.

| Page | en 1440 | en 390 | ar 1440 | ar 390 |
|---|---|---|---|---|
| `/` | 17,716 | 21,380 | 17,467 | 20,429 |
| `/chat` | 8,729 | 10,999 | 8,819 | 10,933 |
| `/bookings` | 8,738 | 11,718 | 9,036 | 11,648 |
| `/agent` | 10,308 | 13,940 | 10,454 | 14,148 |
| `/accounts` | 8,840 | 11,351 | 8,962 | 11,352 |
| `/shelf` | 10,462 | 14,004 | 10,546 | 13,766 |
| `/docs` | 10,709 | 15,024 | 10,688 | 14,552 |

Small-text items by the audit's probe (`C:\t\uxaudit\probe.js`: blocks under 15.5 px or in
mono, outside drawings, captions counted, screen-reader-only text left out), en 1440, each page
with its shared header, menus and footer: `/` 191, `/chat` 129, `/bookings` 112, `/agent` 90,
`/accounts` 118, `/shelf` 127, `/docs` 114, total 881. The audit's inventory counts the same
pages by hand, with the shared items once: 553. Both are given again after the build.

## Stages
