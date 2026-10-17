# Tokens

**Status: waiting for `design/tokens.json`** (branch `aly-design-system`, not pushed when this
was written). The roles below are final; the token names in the first column are filled in
from that file. Until then use the custom properties in the "Today" column, which exist in
`apps/web/app/_site/site.css`, and never a literal.

## How to use tokens

- Read values only from the generated files. Never copy a value into CSS, TSX, Python or a
  design file.
- Components use the **semantic** tier. Primitives (Carbon, Volt, Paper, Concrete, Graphite,
  the grey ramp) are for the token file itself.
- A new value is a new token with both theme values and its minimum contrast, added in the
  tokens PR, never inline.
- Dark values are written by the generator into the two identical blocks
  (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and
  `:root[data-theme="dark"]`). A component never has a dark rule of its own.

## Colour roles

| Role | Today (site.css) | Use | Never |
|---|---|---|---|
| canvas | `--canvas` | The page (Paper in light) | |
| surface | `--surface` | Panels, sheets, the window | A second canvas colour |
| surface-subtle | `--surface-subtle` | Wells, quiet rows | |
| text | `--text` | Body and headings | |
| text-muted | `--text-muted` | Secondary text, at least 4.5:1 | Below 11 px |
| line | `--line` | Hairlines between items | Controls' borders (too faint) |
| line-strong | `--line-strong` | Controls, dashed slots, strong rules; darker than the design system's on purpose | |
| focus | `--focus` | Focus rings (green in light, Volt in dark and on Carbon) | Anything else |
| signal (Volt) | `--volt` | The four Volt meanings only | Text on light, backgrounds, discs |
| signal-hover, signal-pressed | `--volt-hover`, `--volt-pressed` | The Volt button's states (darker, never lighter) | |
| on-signal | `--on-volt` | Text and icons on Volt | |
| volt-wash | `--volt-wash` | The current row | Decoration |
| pending | `--pending` | The hollow pending dot | Errors |
| band | `--band` | Carbon blocks: band, plate, closing call (Carbon in light, a lifted Carbon in dark) | |
| window | `--window` | The drawn workspace window, a step above the plate | |
| ok, warn, bad (and their soft tints) | product only (`globals.css`) | Status in product screens, with words beside the colour | Red and green alarms on the dashboard; status colour as the only signal |
| WhatsApp group | `--wa-*` | Drawings of WhatsApp only, both themes | ALYR's own surfaces; WhatsApp's brand green |

## Type, space, layout, motion

| Group | Today | Note |
|---|---|---|
| Families | `--sans`, `--arabic`, `--mono` | Instrument Sans, IBM Plex Sans Arabic, IBM Plex Mono |
| Site scale | `--display`, `--h2`, `--h3` (`kit.css`), body, small, mono label | Fluid; Arabic line heights beside each step |
| Dense scale | the Agent's 11 / 13 / 15 / 18 / 28 / 56 px (`agent.css` comment) | Product screens and the dashboard |
| Space | 8, 16, 24, 40, 64, 104 px; `--sec` section rhythm | The Agent: 4 and 8 steps, 56 between sections |
| Layout | `--gutter`, `--wide`, `--header`, 12 columns, `--col-gap` | |
| Radius | 2 px controls; the cut instead of large radii | No pills, no 22 px cards |
| Cut and notch | `--notch`, `--cut`, `--fold` | Mirrored in RTL |
| Shadow | `--menu-shadow`, `--window-shadow` | |
| Motion | `--dur-1` to `--dur-4`, `--ease`, `--spring`, `--stagger`, `--travel`, `--dir` | Not `--fast`, `--medium`, `--slow` (an older scale) |
| Breakpoints | 30, 53, 62 rem on the site; 48 rem shared with the Agent | |
| z-index | skip link, header, product bar, contact bar | |
