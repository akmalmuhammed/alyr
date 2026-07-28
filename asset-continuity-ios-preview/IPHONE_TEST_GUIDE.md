# ALYR personal iPhone test

**Verified on Windows:** 2026-07-28

This companion runs in **Expo Go** and does not require the App Store developer
fee. It is a session-only product test, not the signed durable ALYR vault.

> **Compatibility checkpoint:** Expo's current physical-iPhone guidance says
> the App Store Expo Go client supports SDK 54. Only that store version can be
> installed on an iPhone without Apple signing. Recheck this before scanning if
> Expo Go has updated. The signed ALYR app itself remains on SDK 57.

## Before scanning

1. Install the current **Expo Go** from the iPhone App Store.
2. Connect the iPhone and this Windows PC to the same Wi-Fi network.
3. Allow Expo Go to access the iPhone's local network, camera, photos, files,
   and location only when the related ALYR action is being tested.
4. Use test photos, places, documents, email addresses, and passwords. Closing
   the running preview or restarting its JavaScript session can reset all data.

If the preview is no longer running, open PowerShell and run:

```powershell
& "C:\Users\akmal\OneDrive\Documents\alyr\asset-continuity-ios-preview\START_IPHONE_PREVIEW.cmd"
```

You can also double-click `START_IPHONE_PREVIEW.cmd`. Keep that window open
and scan the QR code it prints.

Current LAN URL: `exp://192.168.1.32:8081`

Current QR code:
`C:\Users\akmal\OneDrive\Documents\alyr\docs\product-audit\2026-07-28-iphone-preview-fd95bf9\ALYR-EXPO-GO-QR-fd95bf9.png`

The QR was regenerated from the confirmed LAN URL at 768 x 768 and
independently decoded back to `exp://192.168.1.32:8081`. SHA-256:
`9B71E6F2E8E3770F64497D4F350AF006D9A8391F35B9B1B292891790C461351E`.

## Verified handoff

- The preview reflects canonical app commit
  `fd95bf9707c1d7b92b611891a28ec080578b573b`.
- The live LAN manifest returns HTTP 200 and reports Expo SDK 54.
- The root-owned live iOS development bundle returns HTTP 200. The latest
  result served `21,822,006` bytes with SHA-256
  `FBC50341510402049E8AD0414F8ED636D05C3AE1ABAA3C0D180078BC9BBC5661`.
  Development-bundle hashes may change after a Metro restart, so the clean
  static-export hash below is the reproducibility gate.
- Metro watches only the canonical native app and shared package roots. An
  exact temporary-tree create/delete volatility probe completed while Metro
  stayed alive.
- The companion TypeScript check passes.
- The companion passes **10/10** preview-contract tests and mirrors every
  canonical route file.
- The clean SDK 54 iOS Hermes export contains **4,825 modules**. Its
  `12,581,869`-byte bundle has SHA-256
  `E4D099EF9117133DDCCD5B5ECD139D6E1ED1E70CECD0AFD3FB6016D516A2F78A`.
- The complete static export is **49 files / 23,995,657 bytes**. Its
  deterministic tree SHA-256 is
  `E09788670298E73A1FB66B0B5F59D91503E1ED8DD3624E982632000FCFE54640`.

These are local configuration, contract, manifest, and bundle results. This
handoff does not claim that the current build has been opened or walked through
on a physical iPhone.

## Two useful starting paths

### Fast product tour

1. Open ALYR from the QR code.
2. Choose **Explore sample**.
3. Review Today, Assets and Places, open Search from Assets, then review
   Portfolio, Atlas, an Asset Passport, Family, and Vault.

### Complete first-user journey

1. Choose **Create private workspace**.
2. Create a session-only test account.
3. On the confirmation screen, choose **Continue in test mode**. Expo Go does
   not send or claim to verify an email.
4. Name the household.
5. Choose whether to record an item or a Place first.
6. Complete the capture, then choose **Go to Today**.

## Family invitation and join rehearsal

Keep Metro running and do not reload the Expo Go JavaScript session during
this rehearsal. Use only a test code and test accounts.

### Owner side

1. Open a personal workspace as its owner, then open
   **Vault → Household access**.
2. Choose **Invite a person**.
3. Select **Viewer** or **Editor** and read the visible role consequence.
4. Choose an expiry of 24 hours, 3 days, or 7 days.
5. Choose **Create one-time code**.
6. Confirm the receipt shows the household, selected role, and absolute expiry.
7. Choose **Copy code** and confirm the copied state. The complete raw code is
   copied even though it is visually grouped.
8. Confirm the screen identifies the invitation as preview-only and makes no
   email or SMS delivery claim.
9. Save the test code before leaving the result screen. It is deliberately not
   shown again.
10. Choose **Share invitation** and confirm the native iOS share sheet opens.
   Share only to a test destination you control.

### Recipient side

1. Without reloading Expo Go or restarting Metro, open **Vault → Reset test
   session**, review the consequence, acknowledge it, and reset the owner
   workspace.
2. Create or sign in to a second session-only test account.
3. On household setup, choose **Join a household**.
4. Paste the complete code and choose **Join household**.
5. Confirm that ALYR validates the code before opening household records and
   that the resulting access matches the role selected by the owner.
6. To replay the screen without relying on the generated code, use
   **Review a sample invitation**. This is explicitly labelled as a
   session-only sample and creates no shared cloud access.

The preview invitation exists only in this JavaScript session. It is not a
cross-device invitation, production membership, or durable access record.

## Personal acceptance walkthrough

- [ ] Create an item with a photo.
- [ ] Complete the owner and recipient Family rehearsal above.
- [ ] Use **Reset test session**, choose **Sign in**, then **Forgot password?**,
      set a new test password, and sign in with it. The preview does not send a
      recovery email.
- [ ] Attach a test document or image as proof.
- [ ] Create a Place and confirm a visible property pin.
- [ ] Adjust the pin manually and confirm that the provenance changes.
- [ ] Open **Atlas**, rotate between recorded Places, and confirm the complete
      Place list remains available below the globe.
- [ ] Add or edit a room, zone, or container and confirm its stable hierarchy.
- [ ] Attach a test Place document and confirm it remains separate from item
      Evidence.
- [ ] Record a retrieval clue on an item.
- [ ] Reopen the Asset Passport and update identity, photo, location, or proof.
- [ ] Open Evidence, inspect its metadata, mark the test file reviewed, and confirm
      ALYR does not call review proof of authenticity, ownership, or value.
- [ ] Record an asset value and confirm that Portfolio groups currencies
      separately, uses Day / Month / Year entry, and never calls the result net
      worth.
- [ ] Switch to **العربية** on Welcome. Review Quick Passport, Asset-list
      statuses and locations, Atlas, Portfolio loading/setup, Family, Vault,
      and the Recovery boundary. Confirm text, rows, and directional controls
      mirror correctly, then switch back to English from Vault.
- [ ] Archive a test item, find it with the **Archived** filter, and restore it.
- [ ] Search by item, category, Place, room, or retrieval clue.
- [ ] Background ALYR and confirm the app-switcher privacy shield appears.
- [ ] Increase iPhone text size and confirm primary actions remain visible.
- [ ] Repeat one camera/location permission path after denying permission.

## What this free preview proves

- Native iPhone navigation and visual hierarchy
- Session-only sign-up/sign-in/onboarding behavior
- Session-only password recovery and reset behavior
- Session-only owner invitation and recipient join-flow review
- A truthful test-session reset that clears the active preview workspace and
  returns to Welcome
- Camera, photo picker, document picker, foreground location, and manual pin UI
- Capture, search, Passport editing, Place hierarchy, Atlas, evidence review,
  archive/restore, portfolio, and truthful empty/error states
- Complete EN/AR RTL coverage for onboarding, Quick Passport, item and Place
  editors, Atlas, Recovery create/restore, Asset-list statuses and locations,
  Portfolio, Family, Vault, VoiceOver labels, and directional controls

## Current Expo Go limits

- The register, test account, and attachment references exist only for the
  current JavaScript session. A reload or server restart may reset them.
- Invitation codes and accepted preview roles exist only in that same
  JavaScript session. The iOS share sheet shares text; it does not create a
  cloud membership or deliver an ALYR email/SMS.
- Test files are limited to 10 MB each. They remain picker-owned, unencrypted
  session references, so use test material only.
- Location testing is foreground-only. ALYR shows reported GPS accuracy and
  keeps a manually adjusted pin distinct from a measured position.
- Recovery Kit creation and restore stay off in Expo Go. Their routes remain
  visible and explain that the signed build is required instead of applying
  weaker protection.
- Email delivery, cloud synchronization, background work, biometric unlock,
  and durable encrypted storage are outside this preview.

## What waits for a signed development build

- Durable SQLCipher storage and process-death recovery
- SecureStore key lifecycle and account/household vault isolation
- Real email confirmation and Supabase household synchronization
- Signed-account sign-out, membership revocation, and cross-device convergence
- Background upload, remote notifications, biometric unlock, and encrypted
  Recovery Kit creation and restore
- Final signed permission prompts, entitlements, and App Store distribution

No physical-iPhone run is claimed in this handoff. The free Expo Go walkthrough
above is the next personal-device check; it is separate from a signed ALYR
installation.
