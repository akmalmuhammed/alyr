# Personal Asset App — Onboarding Research Library

**Status:** Product reference
**Last updated:** 2026-07-30
**Public product name:** Pending
**Scope:** iOS, Android, and behaviorally equivalent web onboarding

This document preserves the onboarding research and converts it into explicit
product decisions. It distinguishes source observations from decisions and
hypotheses made for this product.

---

## 1. Product onboarding objective

Onboarding is successful when the user has experienced the product's real value,
not when they have read a feature tour or created an account.

### Activation event

> **The user saves one usable Asset Passport containing a real item, a clear
> identity, and a known or explicitly deferred location.**

Evidence is encouraged during the first session but remains optional because
many users will not have a receipt or document available at that moment.

### First-value targets

| Outcome | Product target |
|---|---:|
| Basic Passport: photo, name, place or `Set later` | Under 90 seconds |
| Trustworthy Passport: photo, identity, exact place, optional first proof | Under 5 minutes |
| Return to a useful, non-empty Home | Immediately after save |

These are product targets to validate with pilot users, not benchmarks claimed
by the sources.

---

## 2. Sources supplied by the product owner

### 2.1 Antonio Ferrara — subscription-app onboarding

**Source:** [The Ultimate Guide to Onboarding in B2C Subscription-Based Apps](https://antoniodesigns.substack.com/p/how-to-design-the-onboarding-in-subscription)
**Published:** 2024-06-26

#### Source observations

- Optimize for the first moment of value rather than the shortest possible flow.
- Increase experienced value, reduce cognitive friction, and establish the
  correct mental model.
- If a first real session predicts future use, include that session in
  onboarding.
- Personalization and user-created content can increase relevance and attachment.
- Break longer work into understandable chunks with clear expectations.
- Use initial low-effort answers to tailor later steps.
- Introduce features when they become relevant.
- Some friction is purposeful when the action is essential or consequential.
- Action-based onboarding is stronger than passive information delivery.

#### Application to this product

- The first real session is the creation of one Asset Passport.
- Teach the model by doing:
  `Thing → Place → Proof → History`.
- Show the reward immediately: the captured object becomes a Passport, appears
  at its selected place, and contributes the first point to the user's private
  world.
- Keep purposeful confirmation for location accuracy, evidence visibility,
  sharing, recovery, and destructive actions.
- If a subscription is introduced later, present it after the user understands
  the value of the Passport and what cloud or family features add.

#### Evidence caveat

The article is a practitioner synthesis. It does not publish a controlled study,
sample definition, or numerical experiment results. Its guidance is treated as
directional.

---

### 2.2 DesignerUp — review of more than 200 flows

**Source:** [I studied the UX/UI of over 200 onboarding flows](https://designerup.co/blog/i-studied-the-ux-ui-of-over-200-onboarding-flows-heres-everything-i-learned/)
**Published:** 2025-02-25

#### Source observations

- Authentication and account setup may be part of onboarding, but they are not
  its purpose.
- Different user types require different levels and forms of guidance.
- Work backward from the result users care about and define the first win.
- Align onboarding with the business model without presenting an unclear or
  premature paywall.
- Progressive disclosure should reveal information at the moment it becomes
  useful.
- Progress, micro-rewards, and restrained animation can create emotional
  engagement.
- Measure step-level drop-off and test one variable at a time.

#### Application to this product

- Offer three clear entry paths:
  1. **Add my first item** — primary
  2. **Explore a sample** — secondary
  3. **Sign in** — quiet existing-user action
- Use one intent choice at most:
  `Home & property / Valuables / Collections / Family records / Everything`.
- Use the answer to recommend a first item and personalize the destination,
  rather than collecting profile trivia.
- Never finish onboarding on an empty dashboard.
- Make the flow resumable after interruptions.
- Keep free and paid capabilities visibly distinct if monetization is added.

#### Evidence caveat

The article is an expert review based largely on observed flows, including
Mobbin records, rather than longitudinal product experiments. Its quoted
abandonment and retention ranges do not link to primary evidence and are not
used as planning benchmarks.

---

### 2.3 Sendbird — mobile onboarding examples and practices

**Source:** [Top 6 examples of app onboarding experiences](https://sendbird.com/blog/mobile-app-onboarding)
**Published:** 2024-05-01

#### Source observations

- Lead with user benefit rather than a feature list.
- Combine benefits-oriented, function-oriented, and progressive onboarding.
- Keep initial questions and signup requirements minimal.
- Use concise visual chunks and visible progress.
- Tailor the experience to purpose.
- Ask for permissions at the moment the related feature is used.
- Let the user experience the product through a real task.
- Track the funnel and keep testing with actual users.

#### Application to this product

- Use one benefit promise, followed immediately by a guided real capture.
- Request camera permission only after `Take a photo`.
- Request location permission only after `Use my location`.
- Open the document picker only after `Attach proof`.
- Ask for notifications only after the user creates something worth reviewing.
- Track event names, timings, and completion states without collecting private
  item titles, coordinates, filenames, image data, or document contents.
- Do not use generic coins, points, streaks, or badges. The real Passport, place,
  and proof state are the reward.

#### Evidence caveat

The article offers practitioner guidance and secondary examples. It does not
provide a quantified uplift for its recommendations or an ideal step count.

---

## 3. Additional benchmark references

| Reference | Observed strength | Transferable principle |
|---|---|---|
| [Apple HIG — Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) | Fast, optional, interaction-led introduction | Teach by doing and move secondary education into context |
| [Android onboarding guidance](https://developer.android.com/design/ui/mobile/guides/patterns/onboarding) | Value before signup or permissions; contextual education | Do not block the product behind a tour or permission wall |
| [CapWords](https://developer.apple.com/articles/capwords/) | Camera action immediately becomes a tactile animated collectible | Turn the user's real photo into the first Passport |
| [Flighty](https://developer.apple.com/news/?id=970ncww4) | Multiple import paths produce an immediate personal object and map | Support Camera, Import, and Manual as first-item paths |
| [Fabulous](https://design.google/library/engagement-is-fabulous-health-app) | Narrative, sound, illustration, and a guided journey | Make setup emotionally coherent rather than decorative |
| [Monzo onboarding case study](https://www.domingowiden.com/projects/monzo-onboarding) | One clear job per step and contextual support | Explain consequences where the decision occurs |
| [Phantom account setup](https://help.phantom.com/hc/en-us/articles/32775281256851-Create-a-new-wallet-with-a-Google-or-Apple-account) | Trust and recovery are staged rather than front-loaded | Local value first, then account protection, biometrics, and recovery |
| [1Password Emergency Kit](https://support.1password.com/emergency-kit/) | Abstract security becomes a tangible recovery artifact | Make recovery concrete and verifiable |
| [Airbnb](https://design.google/library/airbnb-invites-you-in) | Conversational clarity and platform conventions | Use native navigation and plain verbs instead of web-style hero sections |

---

## 4. Consolidated design rules

### Required

1. **Value before account friction.**
2. **One real object during the first session.**
3. **One decision per screen.**
4. **A visible, honest progress model.**
5. **Permissions requested in context.**
6. **Optional fields are visibly optional and resumable.**
7. **The first destination contains the user's real saved record.**
8. **Motion explains a state change.**
9. **Every consequential choice states its effect.**
10. **Analytics exclude private content.**

### Prohibited patterns

- Autoplay marketing carousel
- Feature list before product use
- Account creation as the activation event
- Bulk camera, location, notification, or contact permissions at launch
- Long privacy or security essay before the related action
- Fake sample content mixed with personal records without clear labeling
- Blank Home after setup
- Decorative 3D/glow animation that delays the first action
- Confetti, coins, streaks, or badges unrelated to actual product value
- Unclear paywall or hidden distinction between free and paid capability
- Unrecoverable long form after an interruption
- Session replay of private photos, coordinates, documents, or asset names

---

## 5. Approved first-run spine

```text
Open
→ short brand promise
→ Add my first item / Explore a sample / Sign in
→ optional single intent choice
→ Camera / Import / Manual
→ contextual permission
→ confirm identity
→ exact place, adjustable pin, or Set later
→ optional first proof
→ review
→ Passport reveal
→ real Home with first item and one next action
→ account protection and sync
→ biometrics when the user enables protected access
→ Recovery Kit later, with a concrete explanation
```

### Minimum first Passport

| Field | First session |
|---|---|
| Photo or recognizable visual | Recommended; manual fallback available |
| Name | Required |
| Category | Suggested; quick confirmation |
| Place | Required as exact place or explicit `Set later` |
| Coordinates | Optional; precision shown honestly |
| Proof | Optional |
| Value | Deferred |
| Ownership details | Deferred |
| Family access | Deferred |

---

## 6. Motion and sensory contract

Motion must reveal product physics rather than add spectacle.

| Moment | Motion | Purpose |
|---|---|---|
| Photo accepted | Object lifts cleanly from the camera frame | Shows that a real object is becoming a record |
| Identity confirmed | Object resolves into a Passport surface | Establishes the core object model |
| Place selected | Pin magnetically seats at the chosen place | Confirms location without implying false GPS accuracy |
| Proof attached | Document pages stack and a restrained seal closes | Communicates versioned evidence |
| First save | Passport follows a path into Home/map/globe | Demonstrates where the record now lives |
| Return | One subtle pulse on the next recommended action | Guides without replaying onboarding |

### Timing

- Control response: **180–260 ms**
- Hero state reveal: **450–650 ms**
- One crisp haptic for selection, location anchor, and final save
- No looping motion behind form fields
- No sound by default; optional authored sound can be tested later

### Accessibility

- Respect Reduce Motion.
- Replace spatial transforms with opacity and color-state changes.
- Never communicate completion through animation, color, or haptics alone.
- Announce state changes to assistive technology.
- Preserve controls and consequences under large text and Arabic RTL.

---

## 7. Measurement contract

### Privacy-safe event allow-list

```text
onboarding_started
entry_path_selected
intent_selected
capture_method_selected
camera_permission_result
photo_captured
identity_confirmed
location_method_selected
location_permission_result
location_confirmed
location_deferred
proof_added
proof_deferred
passport_reviewed
passport_saved
passport_reveal_completed
account_protection_started
account_protection_completed
onboarding_resumed
onboarding_abandoned
```

### Never collect

- Asset titles or descriptions
- Addresses or coordinates
- Room or container names
- File or document names
- Document text
- Image or thumbnail data
- Identifiers, serial numbers, or values
- Household member names

### Primary measurements

| Metric | Definition |
|---|---|
| Activation rate | First usable Passport saved / onboarding starts |
| Time to basic value | First launch to basic Passport save |
| Time to trusted value | First launch to Passport with confirmed place |
| Step conversion | Completion of each stage / entry into that stage |
| Resume success | Interrupted flows later completed |
| Permission acceptance | Measured by permission type and contextual entry point |
| Day 7 usefulness | Activated users who view, update, or add another record |

---

## 8. Validation plan

1. Test the current flow with five fresh users and observe without coaching.
2. Record only timing, event state, confusion notes, and verbal feedback.
3. Establish the current activation and time-to-value baseline.
4. Prototype the approved first-run spine.
5. Test the prototype with five different users.
6. Change one major variable at a time:
   - opening promise
   - entry choice
   - intent question
   - capture ordering
   - location wording
   - proof timing
   - account timing
7. Validate iOS, Android, small screens, large text, VoiceOver/TalkBack, and
   Arabic RTL.

---

## 9. Open product decisions

- Whether the single intent choice improves activation enough to justify a step
- Whether `Explore a sample` increases confidence or delays real capture
- Whether photo should be primary or one of three equally weighted paths
- Whether account protection appears immediately after the reveal or on Home
- Whether a lightweight subscription is ever part of this product
- Which brand name and visual identity will anchor the opening promise
