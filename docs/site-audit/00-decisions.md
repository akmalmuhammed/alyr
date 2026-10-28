# Site audit: founder decisions and how the work is split

24 Oct 2026, in chat. They override `01-ux.md`, `02-dx.md` and `03-ax.md` where those differ.

| Topic | Decision |
|---|---|
| Scope | Do all three: UX cleanup (`01-ux.md` top five and its inventory), agent experience (`03-ax.md` top five), developer experience (`02-dx.md` top five) |
| Base | Build on what is live: branch `aly-210-tech-team-homepage` (PR #105, the stack #102 → #105). Merge to main once GitHub billing is fixed and CI runs |
| One action name | **"Book a check-up"** everywhere: header, hero, sticky bar and closing call on the homepage and all six product pages, in both languages (Arabic as the homepage already has it). It stays the same mail link |
| Homepage | **Fold** "What a check-up finds" into "By business": the six problems become each business tab's "Your day today" list, and the "Why ALYR" table shrinks to its single strongest line in the hero lead (`01-ux.md` L2). Record it as an update to D-048 |
| FIG captions | Replace them with a small **"Sample"** mark inside each drawing's own window or phone header (`01-ux.md`'s recommendation). Keep a caption only where the drawing needs words. Update the skills that require FIG captions (`alyr-design` and its `honesty.md` and `components.md`, `alyr-site-page`, `alyr-design-review`), so the rule stays: every sample is marked as fictional once, now in the chrome |
| Honesty | Unchanged. No prices with the offer off, no AI words, nothing "coming", and no availability claims for Docs. Sample numbers must never read as ALYR's results, to people or to machines |

## Who builds what

- **Site agent** (worktree `D:\alyr-ux`, branch `aly-site-audit-fixes`):
  - all of UX;
  - "Book a check-up";
  - the homepage fold;
  - the sample marks;
  - the machine-safe marking of sample figures;
  - JSON-LD structured data;
  - the skills updates.
- **Tooling agent** (worktree `D:\alyr-tooling`, branch `aly-site-tooling`, cut from the same base):
  - a GitHub Actions deploy with a preview per PR, production behind the founder's approval, a commit stamp and a rollback runbook;
  - a CI site job (the real `build-site.sh`, EN/AR copy parity, a banned-words check, a link check);
  - the `pnpm site:*` commands with wrangler pinned;
  - `shoot.mjs`, axe and Lighthouse moved into `scripts/site/` as dev dependencies;
  - `llms.txt`, `llms-full.txt` and a markdown copy of each page generated from the copy at build.

  It does not touch `_site` components or `copy.ts` content.
- **Later, after both merge:** split `copy.ts` by page, with English and Arabic side by side (`02-dx.md` #5). It is a large refactor, so it runs alone.
