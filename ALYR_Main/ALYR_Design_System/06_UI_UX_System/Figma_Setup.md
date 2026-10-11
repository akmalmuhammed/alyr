# Figma Setup

## Recommended file structure

1. `00 Cover + status`
2. `01 Foundations`
3. `02 Brand assets`
4. `03 Icons`
5. `04 Components`
6. `05 Patterns`
7. `06 Templates`
8. `90 Playground`
9. `99 Archive`

## Variable collections

- `ALYR / Primitive` — raw Carbon, Volt, neutral and semantic values.
- `ALYR / Semantic` — canvas, surface, text, border, action and focus roles.
- `ALYR / Layout` — spacing, radius, control height and containers.
- `ALYR / Motion` — duration and easing references.

Modes: `Light`, `Dark`. Add density as component properties rather than a theme mode unless the product requires global density switching.

## Import

Use `Design_Tokens/tokens.json` as the machine-readable baseline. If a token plugin requires a different schema, transform the source rather than manually re-entering values without review.

## Component naming

`Category / Component / Variant`

Examples:

- `Action / Button / Primary`
- `Input / Text field / Default`
- `Feedback / Alert / Danger`
- `Pattern / Approval / AI assisted`

## Properties

Use explicit properties such as `Size`, `Emphasis`, `State`, `Icon`, `Density` and `Theme`. Do not create a separate component for every text label.

## Logo handling

Import the SVG masters as locked components. Name variants exactly as the export matrix. Disable accidental editing of the wordmark paths in ordinary design pages.

## Library publication gate

Publish only components with responsive behavior, all states, accessibility annotation, RTL review and an implementation owner.

