# H3: the four-stage switch (StageTabs)

Built on `aly-h3-tabs`. Files in `apps/web/app/_site/`: `StageTabs.tsx` (server, `StageTabs({ locale, words })`),
`StageTabsClient.tsx` (client: tabs, pill, keys, hash), `stagetabs.css`, `copyStageTabs.ts`
(`StageTabsCopy`, `stageTabsEn`, `stageTabsAr`). The stages' own words still come from `home.stages` (copyHome.ts).

- Wire: add `stageTabs: StageTabsCopy` to the `home` type and `stageTabs: stageTabsEn / stageTabsAr` to both locales
  in copy.ts, then mount `<StageTabs locale={locale} words={copy[locale].home.stageTabs} />`. Delete `Stages.tsx`, `StageIndex.tsx`
  and the `.st-*` rules in stages.css when it goes (nothing here uses them; `Plate`/`Row` are copied in, as `stt-*`).
- Section is `#stages`; the panels' anchors are `#discover`, `#convert`, `#manage`, `#scale` (the old Stages anchors, so remove
  those articles at the same time: duplicate ids otherwise). The hash opens the tab on load and on change and scrolls to the section.
- No script: no switch, four panels stacked with their chip and headline. Script: one shared cell (page never moves), roving tabindex,
  arrows/Home/End (RTL-aware), "Next: X" is a real `#anchor` link the client intercepts. No auto-advance.
- Pill: one element moved by `--idx` (equal-width tabs, no measuring); `[dir="rtl"]` only flips its transform.
- Motion: words rise in along the 45-degree diagonal in order, visual settles, drawn rows tick in, on first view and each open
  (`.motion` + `data-seen` keyed, `prefers-reduced-motion: no-preference` only). Convert and Manage keep their own figure motion.
- Checked: `pnpm exec tsc --noEmit`; dev look at 1440 (dark) for Discover, Convert, Manage; 390 has no horizontal overflow, tabs 85x44;
  click, arrows, End, Next and hash tested in the browser. Panel height is set by the tallest tab (Convert, about 825 px at 1440), so a
  panel is not one screen tall: the flow figure cannot shrink. Not checked: light theme, Arabic render, axe, 320 px, no-script screenshot.
- Unsure: the plate on a Carbon-on-soft-grey panel in dark mode is low contrast against the panel (hairline only); founder may prefer white window cards.
