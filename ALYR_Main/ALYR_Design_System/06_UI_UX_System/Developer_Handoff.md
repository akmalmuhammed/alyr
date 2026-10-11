# Developer Handoff

## Integration order

1. Import `Design_Tokens/tokens.css` at the application root.
2. Map product theme variables to semantic tokens; do not use raw hex values in components.
3. Use SVG logo masters as static assets. Never rebuild the wordmark with text.
4. Implement primitive components with accessibility states before page patterns.
5. Add visual-regression examples for both themes and RTL.

## Token rule

Components consume semantic tokens (`--color-action`, `--color-text`) rather than brand primitives (`--alyr-volt`) except in explicit brand artwork.

## Suggested component layers

- **Foundations:** tokens, reset, typography, icons.
- **Primitives:** button, input, text, stack, cluster, divider.
- **Composites:** field, search, status, pagination, table controls.
- **Patterns:** workflow tracker, approval panel, intake step, client summary.
- **Templates:** marketing page, portal shell, owner dashboard.

## State contract

Every networked component defines loading, empty, partial, error, offline, stale and success states. Preserve user data across retryable failures.

## Analytics

Track decisions, not every click. Recommended events:

- `audit_started`
- `audit_submitted`
- `working_session_requested`
- `proposal_viewed`
- `deliverable_approved`
- `document_upload_failed`
- `ai_suggestion_accepted`
- `ai_suggestion_rejected`

Do not send personal document values or sensitive free text into analytics.

## Asset caching

Fingerprint production assets or serve versioned paths. SVG logos may be cached long-term. Update favicons and social assets through controlled releases because platform caches are persistent.

## Browser support

Support current stable Chrome, Edge, Safari and Firefox unless a client contract requires otherwise. Use progressive enhancement for container queries and advanced color functions.

