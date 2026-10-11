# ALYR Icon Guidelines

## Construction

- Base grid: 24×24.
- Stroke: 1.7px at 24px; optical adjustment allowed for clarity.
- Caps: square.
- Joins: miter by default, round only when the object meaning requires it.
- Corners: restrained; no universal rounded treatment.
- Default color: `currentColor`.

## Sizes

- 16px: compact table/action contexts; simplify internal detail.
- 20px: dense navigation.
- 24px: default controls and lists.
- 32px: feature or service identifiers.
- 48px+: use the service-symbol system, not a scaled UI icon.

## Usage

- Pair unfamiliar icons with labels.
- Use icons to improve scanning, not to decorate every heading.
- Keep one icon per control.
- Never communicate status through an icon alone; include text for high-risk actions.
- Mirror directional icons in RTL; do not mirror universal objects such as documents, clocks or the ALYR mark.

## Adding an icon

1. Confirm no existing icon communicates the action.
2. Draw on the 24px grid using the construction rules.
3. Test at 16, 20 and 24px on both themes.
4. Add an accessible name only when the icon is not accompanied by visible text.
5. Add the SVG to `UI_Icons_SVG`, update the showcase and regenerate inventory.

