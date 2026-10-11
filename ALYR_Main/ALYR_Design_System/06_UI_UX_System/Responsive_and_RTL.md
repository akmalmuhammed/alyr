# Responsive and RTL Rules

## Breakpoint intent

| Range | Behavior |
|---|---|
| `<480px` | Single task, single column, bottom-safe actions |
| `480–767px` | Larger mobile and compact two-up content where meaningful |
| `768–959px` | Tablet; adaptive navigation and split content selectively |
| `960–1279px` | Application shell with collapsible side rail |
| `1280px+` | Full shell and wide analytical layouts |

Breakpoints are content decisions, not device labels.

## Mobile adaptation

- Convert wide tables to prioritized data lists or horizontal-scroll regions with clear affordance.
- Move secondary actions into a labeled menu, never hide them without replacement.
- Keep primary task context and status visible.
- Use sticky bottom actions only for clear, high-value completion steps.
- Avoid desktop sidebars compressed into narrow columns.

## RTL

- Build with CSS logical properties.
- Mirror navigation order, breadcrumbs, progress direction and directional icons.
- Preserve numeric and identifier readability using isolated bidi spans where needed.
- Keep the ALYR logo geometry unchanged.
- Test every pattern rather than relying on automatic `direction: rtl`.

