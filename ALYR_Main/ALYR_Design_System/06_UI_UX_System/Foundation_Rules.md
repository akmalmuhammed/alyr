# UI Foundation Rules

## Experience direction

ALYR product experiences should feel like a calm command system: dense enough for serious work, clear enough for a first-time client, and focused on the next meaningful decision.

## Grid

- Marketing and editorial: 12 columns, fluid outer gutter, 1440px maximum wide container.
- Application shell: 17rem navigation rail plus fluid work area; collapse to an off-canvas menu below 960px.
- Reading content: 44rem maximum.
- Forms: 36rem default; use wider layouts only for paired fields or data-heavy tables.
- Use asymmetry to establish hierarchy; do not center every section.

## Spacing

Use the 4px base scale. Components use consistent internal spacing; page composition may use 48, 64, 80, 96 and 128px intervals to create editorial rhythm.

## Surfaces

- Default light canvas is softened Paper, not pure White.
- White is reserved for controls and content surfaces requiring separation.
- Carbon is used for command surfaces, navigation, critical summaries and high-value moments.
- Avoid placing every content group in a card. Use alignment, rules and whitespace first.

## Corners and borders

- 4px: tags, compact controls and precise objects.
- 8px: inputs, buttons and standard panels.
- 12px: large interactive panels.
- 16px: app icons and rare hero media.
- Fully rounded: status dots, avatars and toggles only.

Borders should normally be 1px. Use 2px only for focus, selected state or structural emphasis.

## Elevation

Prefer spatial separation and borders. Shadows are reserved for floating menus, sticky overlays, drag states and high-consequence focus surfaces.

## Focus

All interactive elements use a 2px focus ring with 2px offset. The focus color adapts by theme. Do not remove outlines unless an equal or stronger visible replacement exists.

## Density modes

- **Comfortable:** customer portals, onboarding and marketing tools.
- **Compact:** owner dashboards, case management and tables.

Density may change control height and cell padding but never reduce body text below 14px or target size below 32px for pointer-only interfaces.

