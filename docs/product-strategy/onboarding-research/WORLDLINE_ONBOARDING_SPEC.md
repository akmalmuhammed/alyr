# Worldline Onboarding — Build Specification

**Status:** Selected visual direction
**Selected:** 2026-07-30
**Surface:** Expo / React Native for iOS and Android, behaviorally equivalent web preview
**Public product name:** Pending
**Reference image:** `C:/Users/akmal/OneDrive/Documents/alyr/docs/product-audit/2026-07-30-worldline-onboarding/reference-worldline.png`

---

## 1. Outcome

Replace the website-like first screen with a native, user-controlled introduction
that establishes the product model and leads to the existing secure account and
first-Passport journey.

The intro does not create a second authentication state machine. It ends at the
existing auth Welcome, account, household, and durable first-record handoff.

### Activation remains

> One usable Asset Passport saved with a clear identity and a known or explicitly
> deferred place.

The intro is education and motivation. It is not activation.

---

## 2. Worldline visual grammar

One continuous line performs four jobs:

1. Indicates onboarding progress.
2. Frames the user's object.
3. Becomes a path connecting object, place, and proof.
4. Wraps around the globe and ends at the confirmed location.

The line uses a controlled violet → blue → cyan gradient. A small lime endpoint
appears only for confirmed state. Dark Carbon remains the dominant canvas.

### Visual constraints

- No permanent public wordmark until naming is complete.
- No cryptocurrency, token, wallet, balance, or network imagery.
- No fake valuation or completion metrics.
- No nested glass cards.
- No auto-advancing carousel.
- No looping essential animation.
- One primary action per scene.
- All synthetic example content is visibly labeled as an example.

---

## 3. Four-scene flow

### Scene 1 — Promise

**Title:** `Know what you have. Know where it is.`
**Body:** `Keep important things, exact places and proof connected in one private record.`

Motion:

- Worldline draws from left to right.
- Three small object thumbnails enter the line in sequence.
- The line ends at the primary action.

Actions:

- Primary: `Show me how`
- Secondary: `Skip introduction`
- Quiet existing-user action: `Sign in`

### Scene 2 — Place

**Title:** `Everything connects to a place.`
**Body:** `A property, room, shelf or precise pin—use the level of detail you actually know.`

Motion:

- The line wraps around the existing offline globe.
- Example assets move along short arcs to clearly synthetic example pins.
- Pins settle once; the globe then becomes still.

Actions:

- Primary: `Continue`
- Secondary: `Back`

### Scene 3 — Proof

**Title:** `Keep the proof beside the thing.`
**Body:** `Photos, receipts and documents stay connected to the item they support.`

Motion:

- Photo, place, and document layers align into one Passport.
- The line becomes the Passport boundary.
- A short confirmed signal closes the path.

Actions:

- Primary: `Continue`
- Secondary: `Back`

### Scene 4 — Start

**Title:** `Start with one thing.`
**Body:** `Your first Passport takes only a photo, a name and a place—or you can set the place later.`

Motion:

- The Passport resolves into the opening camera/import/manual choice.
- The worldline becomes a static four-step completion line.

Actions:

- Primary: `Add my first item`
- Secondary: `Explore a sample`
- Quiet: `Sign in`

The primary action completes the intro and enters the existing account creation
path. Sample and sign-in preserve their existing behavior.

---

## 4. Post-save globe reveal

After the first real Passport is saved, show the selected Worldline reveal once:

1. Passport confirms.
2. Globe turns or appears at the real region.
3. Asset travels along one geodesic line.
4. Marker seats with one success haptic.
5. Text confirms item, place, and proof state.
6. User chooses `Continue to Home` or `View Passport`.

This screen uses the user's real record. It never invents GPS accuracy,
ownership, evidence, value, or additional saved assets.

---

## 5. Motion contract

| Moment | Duration | Behavior |
|---|---:|---|
| Press feedback | 80 ms | Scale/opacity only |
| Small state | 160 ms | Opacity/transform |
| Layer alignment | 280 ms | Coordinated transform |
| Scene transition | 480 ms | Fade + directional transform |
| Globe reveal | 900–1,450 ms | Staged path, marker, text |

Default easing: `cubic-bezier(.16, 1, .3, 1)`.

Animation pauses when the app backgrounds or the scene is not active.

### Haptics

- One selection haptic on chosen capture method.
- One success haptic when a real Passport marker seats.
- Haptics never carry unique meaning.

### Reduce Motion

- Replace line drawing and travel with 80 ms crossfades.
- Show the globe at its final orientation.
- Show asset markers at final positions.
- Keep named progress and textual confirmation.
- Announce the result through assistive technology.

---

## 6. Technical architecture

```text
app/(onboarding)/index.tsx
└── OnboardingExperience
    ├── WorldlineProgress
    ├── PromiseScene
    ├── GlobeScene
    ├── ProofScene
    └── StartScene

src/onboarding/
  OnboardingExperience.tsx
  OnboardingGlobe.tsx
  WorldlineProgress.tsx
  onboardingCopy.ts
  onboardingSeenStore.ts
  motion.ts
  types.ts
```

Rules:

- Reuse the current orthographic projection and Natural Earth coastline data.
- Do not animate coastline projection on every frame.
- Animate overlays, path progress, pins, and opacity on the UI thread.
- Persist intro completion locally and idempotently.
- A sign-out does not replay the intro.
- A test/development reset can replay it explicitly.
- Preserve the current auth, household, capture, repository, sync, and recovery
  behavior.

---

## 7. Dependency decision

Use:

- React Native Reanimated
- React Native Worklets
- React Native Gesture Handler
- React Native SVG
- Expo Haptics
- Expo Linear Gradient

Do not add Lottie, Rive, Skia, Three.js, or GLView for this release.

---

## 8. Acceptance gates

### Functional

- First launch enters Worldline.
- Skip enters the existing Welcome.
- Primary completion enters account creation.
- Sample and sign-in retain current behavior.
- Intro completion survives restart.
- Auth and first-Passport behavior remain unchanged.
- Back preserves scene state.

### Visual

- Matches the selected reference at 390 × 844.
- Works at 320 × 568 without clipped actions.
- Works at large text settings.
- Globe remains the signature scene.
- No permanent product name is embedded.

### Accessibility

- Reduce Motion path passes.
- VoiceOver/TalkBack reads title, body, progress, and actions in order.
- Decorative motion is hidden from the accessibility tree.
- All actions have at least 44 × 44 points.
- English and Arabic RTL preserve meaning and control order.

### Quality

- TypeScript passes.
- Jest passes.
- Maestro static contracts pass.
- Expo Doctor passes.
- Web preview has no blocking console errors.
- Android/Expo Go bundle loads.
- Design QA result is `passed`.
