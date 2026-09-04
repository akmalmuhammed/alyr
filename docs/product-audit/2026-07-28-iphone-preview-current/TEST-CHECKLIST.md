# ALYR iPhone Preview Acceptance

Date: 28 July 2026
Runtime: Expo Go, session-only
LAN entry: `exp://192.168.1.32:8081`

## Before starting

- Install Expo Go on the iPhone.
- Connect the iPhone and this Windows computer to the same Wi-Fi.
- Confirm Metro is still running on port `8081`.
- Scan `ALYR-EXPO-GO-QR.png` with the iPhone camera.
- Record the iPhone model, iOS version and text-size setting below.

| Detail | Result |
|---|---|
| iPhone model | |
| iOS version | |
| Text size | Default / Large / Accessibility |
| Language | English / Arabic |
| Preview opened | Pass / Fail |

## Core walkthrough

| # | Journey | Acceptance | Result |
|---:|---|---|---|
| 1 | First launch | Welcome screen loads without clipping; Create, Explore sample and Sign in are distinct. | |
| 2 | Sample workspace | Explore sample opens Today and never implies a secure personal account. | |
| 3 | Today | One clear next action is dominant; Portfolio and Atlas are secondary signals. | |
| 4 | Portfolio | Portfolio title, recorded net position, Assets − Liabilities equation and privacy control are legible. | |
| 5 | Assets | Items and Places use rule-led tabs; search, capture and organizer actions respond. | |
| 6 | Asset Passport | Photo, identity, record metadata, retrieval, readiness and proof read as one dossier. | |
| 7 | Atlas | Globe/List tabs respond; globe, pins and Place list remain usable. | |
| 8 | Family | Household access overview and roster are readable; role and state remain clear. | |
| 9 | Vault | Protection, proof, recovery and settings hierarchy is clear. | |
| 10 | Capture | Item name, photo choice, location choice, proof choice and review can be completed. | |
| 11 | Receipt | An incomplete minimum record says “Passport started”; it does not claim readiness. | |
| 12 | Arabic | Navigation order, arrows, headings, numbers and mixed Arabic/English text render correctly. | |
| 13 | Large text | Primary actions remain visible and do not overlap the keyboard or Home indicator. | |
| 14 | Relaunch | Expo Go preview reopens; session-only data limitations are communicated honestly. | |

## Expected preview limitations

Expo Go proves layout and shared product behavior. It does not prove:

- SQLCipher availability
- Face ID/passcode vault enforcement
- durable encrypted attachment storage
- durable Recovery Kit cryptography
- iOS background synchronization
- signed-build app-switcher shielding
- native provisioning, TestFlight or App Store distribution

Those checks belong to the signed physical-iPhone acceptance run.

## Findings

| Severity | Screen/step | What happened | Screenshot or note |
|---|---|---|---|
| P0 | | | |
| P1 | | | |
| P2 | | | |
