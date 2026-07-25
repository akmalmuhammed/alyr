# Design QA — Option 3 globe experience

Date: 2026-07-24  
Target: iPhone app surface, 393 × 852 CSS pixels  
Selected reference: `C:\Users\akmal\.codex\generated_images\019f917c-1cff-7b02-a9f7-1c4225dee436\call_sUjN6yMMISdgIXEHyzVAawON.png`

## State under review

- Home screen with the dark asset globe
- Doha selected with owned-place summary
- Globe/List switch, attention card, capture action, and bottom navigation
- First-open orientation and the Add Place → room/item/proof flows

## Checks completed

- TypeScript compilation
- Production Vite build
- Protected mobile-runtime integrity check
- 8/8 mobile interaction tests
- 4/4 Sites packaging tests
- Static product-flow, WebGL, persistence, navigation, and accessibility review
- Local HTTP response: 200

## Visual comparison blocker

The selected reference and implementation could not be placed into the required side-by-side visual comparison because the existing Codex in-app browser tab remains on a stale “This site can’t be reached” error document. Browser policy blocks programmatic navigation away from that error document. Per the selected Product Design workflow, no alternate browser was used.

The user must press **Reload** in the existing in-app browser tab after the local server is running. The final same-viewport screenshot comparison and visible interaction pass can then be completed.

## Final result

blocked — implementation and automated checks pass; final visual QA is pending an in-app browser reload.
