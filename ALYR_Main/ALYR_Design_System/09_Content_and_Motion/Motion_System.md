# Motion System

## Purpose

Motion explains state and direction. It should make the system easier to understand, not make ALYR look futuristic.

## Timing

| Token | Duration | Use |
|---|---:|---|
| Instant | 80ms | Press feedback |
| Fast | 160ms | Hover, focus, small state change |
| Medium | 280ms | Menu, disclosure, panel transition |
| Slow | 480ms | Page/section reveal, major state change |

Default easing: `cubic-bezier(.16, 1, .3, 1)`.

## Signature motion

The ALYR motion gesture follows the cut-Y/fold angle: information resolves along a precise diagonal, followed by a short Volt signal. Use it for major reveals only.

## Rules

- Animate opacity and transform where possible.
- Use grid-row transition for content disclosure.
- Do not use bounce, elastic or continuous glow.
- Keep hover movement to 1–2px.
- Do not animate essential data indefinitely.
- Loading indicators must include text when waits exceed two seconds.

## Reduced motion

When `prefers-reduced-motion: reduce` is active, remove spatial travel and parallax. Preserve immediate opacity/state changes so the interface remains understandable.

