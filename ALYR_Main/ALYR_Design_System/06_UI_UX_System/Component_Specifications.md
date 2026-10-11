# Component Specifications

## Actions

### Button

Variants: primary Volt, secondary Carbon/neutral, outline, ghost, text and destructive.

Required states: default, hover, active, focus-visible, disabled, loading and success confirmation when applicable.

- One primary button per decision area.
- Button labels begin with a verb.
- Do not use color alone to distinguish destructive action.
- Loading buttons preserve width and announce progress to assistive technology.

### Icon button

Minimum visible target: 40×40px, even when the glyph is 20px. Requires accessible name and tooltip for unfamiliar actions.

## Inputs

Components: text field, textarea, select, combobox, date picker, file upload, checkbox, radio, segmented control, switch, search and OTP/PIN input.

Every field requires:

- Persistent label.
- Optional description before interaction.
- Error message explaining recovery.
- Success state only when confirmation helps.
- Disabled and read-only states with different semantics.

Placeholder text is an example, never the only label.

## Navigation

Components: global header, side navigation, breadcrumbs, tabs, pagination, command menu and mobile drawer.

- Current location must be visible without relying on color alone.
- Do not use tabs for sequential steps.
- Preserve task state when users navigate back.
- In Arabic, order and direction must follow the RTL reading model.

## Feedback

Components: inline validation, alert, banner, toast, progress, skeleton, empty state and confirmation panel.

- Inline feedback for field-level issues.
- Banner for page-level blocking conditions.
- Toast for reversible or non-blocking confirmation.
- Never use a toast as the only record of a failed high-value action.

## Data display

Components: status badge, avatar, metric, timeline, stepper, table, data list, disclosure, activity feed and chart shell.

- Tables provide sorting state, empty state, loading state and a mobile alternative.
- Numbers use tabular figures.
- Charts include text summaries and accessible data tables when required.
- Badges use semantic text, not color-only dots.

## Containers

Components: section, panel, split view, drawer, popover and modal.

Use modals only when users must respond before returning to the underlying task. Use a page or drawer for multi-step work, review, comparison or content that needs a stable URL.

## Component API baseline

All interactive components expose:

- Size, emphasis and density where relevant.
- Accessible name/description hooks.
- Error and loading state.
- Disabled and read-only behavior.
- RTL support.
- Reduced-motion behavior.
- Analytics event identifier for high-value actions.

