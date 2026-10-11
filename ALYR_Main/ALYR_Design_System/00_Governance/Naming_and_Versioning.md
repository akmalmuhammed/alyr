# Naming and Versioning

## File naming

Use lowercase kebab-case for production assets:

`alyr-[asset]-[variant]-[background]-[size].[ext]`

Examples:

- `alyr-logo-horizontal-carbon-volt.svg`
- `alyr-symbol-reversed-carbon-512.png`
- `alyr-linkedin-company-banner-1584x396.png`

The current generator uses concise names inside clearly scoped folders. Do not rename individual exports without updating the inventory and consuming code.

## Versioning

- **Major:** logo, core palette, type family or component API breaks.
- **Minor:** additive component, pattern, icon or channel template.
- **Patch:** correction, accessibility fix or export repair with no conceptual change.

Release format: `vMAJOR.MINOR.PATCH`.

## Status labels

- `draft` — exploration only; do not publish.
- `candidate` — ready for controlled review.
- `approved` — may be used in production.
- `deprecated` — supported temporarily; replacement named.
- `archived` — historical reference only.

## Source ownership

SVG and token files are sources. PNG, ICO and screenshot files are generated outputs. Never edit a generated output manually.

