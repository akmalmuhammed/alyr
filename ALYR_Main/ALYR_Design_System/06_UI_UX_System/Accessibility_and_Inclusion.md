# Accessibility and Inclusion

Target: WCAG 2.2 AA for customer and internal digital products.

## Non-negotiables

- Text contrast: 4.5:1 minimum for normal text, 3:1 for large text.
- Non-text UI contrast: 3:1 minimum for essential controls and states.
- Visible keyboard focus on every interactive control.
- Full keyboard task completion.
- 24×24 CSS pixel minimum target, with 40×40 preferred for frequent controls.
- Semantic HTML before ARIA.
- Form errors linked programmatically to fields.
- Status updates announced appropriately.
- Captions/transcripts for meaningful audio and video.
- No critical motion without a reduced-motion alternative.

## Color-specific rule

Volt is not approved as small text on Paper/White. Use Carbon text on a Volt surface, or Volt as a non-text accent on Carbon. Verify every new color combination with a contrast tool.

## Language and cognition

- Use short labels and progressive disclosure.
- Explain uncommon technical terms at first use.
- Keep high-risk instructions visible, not hidden in tooltips.
- Confirm consequences near the action.
- Avoid time limits; if necessary, allow extension.

## Arabic and multilingual

- Set `lang` and `dir` correctly at document or component level.
- Use logical CSS properties (`margin-inline`, `inset-inline-start`).
- Mirror directional flows and arrows, not brand marks or universal icons.
- Test Arabic line wrapping, diacritics, form labels, numerals and mixed Latin IDs.
- Do not reduce Arabic font size to force visual parity with Latin.

## QA matrix

Test Chrome, Safari and Edge; keyboard only; 200% zoom; Windows high contrast; VoiceOver or NVDA; reduced motion; light/dark themes; English/Arabic; 320px, 768px, 1024px and wide desktop.

