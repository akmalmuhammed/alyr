# Heldat launch-control handoff — 2026-07-31

This snapshot records verified controls only. It contains no credentials or
secret values.

## Release decision

Android build 6 is the current **static and Android-emulator candidate**. It is
not yet approved for public distribution. Builds 3, 4, and 5 are superseded
and non-distributable because each has a reproduced release blocker recorded
below. Build 6 still requires physical Android-device acceptance and parity
testing of the exact Play-distributed binary.

Heldat otherwise remains in a controlled-pilot posture. Physical iOS/TestFlight,
real backup and restore, migrations `202607310007`, `202607310008`, and
append-only hardening migration `202607310010` (with legacy `009` recorded as
superseded without execution),
transactional email, legal and store identities, distribution accounts/fees,
and the documented 10K capacity, abuse, observability, storage, and cost gates
remain open.

## Verified platform state

| Control | Verified result | Release consequence |
|---|---|---|
| Public TLS | `https://heldat.app` is live. Cloudflare minimum TLS is `1.2`; a TLS 1.0 probe exited `35`, while TLS 1.2 returned HTTP `200`. | TLS versions below 1.2 are rejected. |
| Cloudflare operator | The operator confirmed that the `heldat.app` zone is verified in the approved Cloudflare account. Public DNS and edge behavior were independently verified. | Keep account recovery and MFA evidence in the private operator runbook. |
| HTTPS enforcement | **Always Use HTTPS** is enabled. Plain HTTP returns `301` to HTTPS. | Public web traffic is redirected to HTTPS. |
| HTTPS headers | HTTPS responses include HSTS `max-age=31536000; includeSubDomains`, CSP, `X-Content-Type-Options: nosniff`, Referrer-Policy, and Permissions-Policy. | The verified edge security-header baseline is active. |
| DNSSEC | Spaceship accepted the exact DS record below. Public Google DNS returned status `0`, `AD=True`, and the same DS; Cloudflare reports that the domain is protected with DNSSEC. | DNSSEC publication and public validation are complete. |
| Email authentication | Cloudflare and Google Public DNS return the exact `_dmarc.heldat.app` monitoring record below. | The non-blocking DMARC baseline is complete; enforcement and transactional sending remain pending. |
| Google Cloud operator | The active CLI identity matches the approved operator profile and dedicated Heldat release project. Billing is disabled. The Play publisher service account has zero user-managed keys and no project-level IAM role. | Play Console access remains a later distribution gate. |
| Supabase database transport | The pooler route completed certificate verification over TLS 1.3 using AES-256-GCM. | Keep certificate verification enabled for operator database connections. |
| Backup operator access | The Windows DPAPI operator vault was updated. The real-project `backup --dry-run` passed with `writes: false`. | No actual backup, off-project copy, restore drill, exact migration `202607310007`/`202607310008`/`202607310010`, or 009-supersession ledger action has run. |
| iOS simulator | The fresh simulator artifact described below passed its recorded checks. | This is not physical-device, signed TestFlight, or App Store evidence. |
| Android build 6 | Source, AAB, APK, static validation, and the scoped Android 15/API 35 emulator journey passed as described below. | Physical Android and exact Play-track parity remain release gates. |

## DNS and email records

Spaceship accepted key tag `2371`, algorithm `13` (`ECDSA-SHA256`), digest
type `2` (`SHA256`), and this digest:

```text
heldat.app. 3600 IN DS 2371 13 2 BA918EC223C1EE65100CB5E98121F81A84A7D1C40FC36776A02BF69C58D4B324
```

Cloudflare serves this public DMARC monitoring record:

```text
v=DMARC1; p=none; rua=mailto:security@heldat.app; adkim=r; aspf=r; fo=1; pct=100
```

`p=none` collects reports; it does not quarantine or reject. Tighten the policy
only after Brevo domain verification/DKIM, delivered SPF and DMARC alignment,
transactional flows, and aggregate reports are verified. Add an SPF or custom
return-path DNS record only when the selected provider setup explicitly
supplies it; preserve a single SPF policy and a single DMARC record.

## iOS simulator evidence

- Production-posture EAS build `6ec7707a-c146-4237-9631-fb506c72df47`
  finished with Xcode 26.6 and the iOS 26.5 Simulator SDK. Its downloaded
  artifact passed all `13/13` release checks and has SHA-256
  `706B76ABA589ABC728E8E95D3779077A92E8448C87CE04AA8E0820AD071E063F`.
- Clean-source development-simulator build
  `eeb18e56-ffcd-45b4-b937-2c24a62730fd` finished from
  `afd72f2eb76494cf68d694575bcef119006cbb54`; its artifact passed `14/14`
  expected development checks and has SHA-256
  `AEC635AC9F81118B9B6D3378BBA91518F76DC133E5A6485002A191EA152B311B`.
- Full native validation passed `202` suites / `1,274` tests, `10` Maestro
  flows / `57` selector contracts, Expo Doctor `20/20`, and the production
  Hermes export.
- Exact paths, provenance distinctions, and artifact checks are recorded in
  `docs/release/ios/IOS_SIMULATOR_BUILD_EVIDENCE_2026-07-31.md`.
- Boundary: neither simulator artifact is signed for an iPhone or accepted by
  TestFlight/App Store. Associated-domain entitlement and universal-link proof
  remain part of the Apple-signed physical-device gate.

## Superseded Android builds

| Build | Source | Status | Exact release blocker |
|---|---|---|---|
| 3 | `eccba3bf4bae708e5b463b872b789e5586bce9df` | **Superseded; non-distributable** | Expo SQLite exclusive transactions opened a new native connection without reapplying the connection-local SQLCipher key. `Explore sample` deterministically returned `NativeDatabase.prepareAsync` / `file is not a database`. |
| 4 | `82e9f856b59fda7c9490531a864842f6010fc9ba` | **Superseded; non-distributable** | SQLCipher was fixed, but the tabs route crashed under Hermes because `Intl.PluralRules` was undefined; the route produced `TypeError: undefined cannot be used as a constructor` and a blank tabs surface. A separate P2 white-on-light Android status-bar contrast issue was also present. |
| 5 | `f6f24213f5319f64fff3d4541a044656689c45d3` | **Superseded; non-distributable** | The tabs and status-bar defects were fixed, but both force-stop and verified `kill -9` cold launches raced the signed-sample workspace bootstrap and redirected to Welcome/Workspace Choice. The encrypted data remained intact, but direct cold resume failed. |

No build 3, 4, or 5 artifact is an approved pilot or store handoff.

## Android build 6 candidate

### Source and cloud records

- Source commit: `faa751a86d73021c2883bf1deb31f5b9ae8e8bee`
- Production EAS build: `7db5077a-f866-40e1-807c-b4eb32afbfeb` — `FINISHED`
- Preview EAS build: `21657ca8-8f37-4fc0-94f4-6e50995654fc` — `FINISHED`
- Shared fingerprint ID: `019fb8af-c863-7073-8f09-005a060979e5`
- Shared fingerprint hash: `7ae0a98ef3705af37415a790c136cee0504838fb`
- App identity: `app.heldat.mobile`; Heldat `0.1.0` (`versionCode 6`)
- Android SDK: minimum `24`; target/compile `36`

### Artifacts

| Artifact | Path | Bytes | SHA-256 |
|---|---|---:|---|
| Production AAB | `D:\HeldatArtifacts\current\faa751a\heldat-android-production-faa751a-v0.1.0-build6.aab` | `117896044` | `FF6C1A9D4CDE60BFFB764646253A08877AA2872869DCDED512C950EAD4FAF12E` |
| Preview APK | `D:\HeldatArtifacts\current\faa751a\heldat-android-preview-faa751a-v0.1.0-build6.apk` | `158901232` | `CB31B380EBE959F6DAD400FEA6AAD8D53C1472EB894390824633B5A27C269F8E` |

The AAB and APK have matching known signing-certificate continuity. The AAB
is a Play upload format; the APK is the directly installable validation
artifact. Neither is yet a public-distribution approval.

### Source and static gates

- Authoritative native source gate: `202` suites and `1,274` tests passed.
- Maestro inventory: `10` flows, `5` subflows, and `57` selectors passed.
- Typecheck, production configuration, and recovery-crypto checks passed.
- Dual-artifact static verification: `69/69` checks passed.
- AAB and APK identity, hashes, signing continuity, SDK contract, manifests,
  ZIP integrity, Hermes bundle, SQLCipher/crypto native libraries, and all four
  ABIs passed.
- AAB: `1,520` entries, `5` DEX files, `104` native libraries, and `110`
  executable payload entries.
- APK: `1,447` entries, `5` DEX files, `104` native libraries, and `110`
  executable payload entries.
- Denied executable dependency markers: `0` in both artifacts.
- Secret-leak file results: `0`.

### Build 6 runtime scope

Build 6 reran all of the following on a fresh offline Android 15/API 35 Pixel
7 emulator using the signed preview APK:

1. Artifact identity, bytes, hash, signature, SDK, and ABIs.
2. Fresh uninstall/install and cold launch.
3. Onboarding and Workspace Choice.
4. Signed-out sample activation to populated Today.
5. Encrypted database path, files, and non-plaintext header.
6. `am force-stop` followed by a plain MainActivity cold launch directly to
   the populated sample tabs.
7. A verified Heldat PID `kill -9` followed by the same plain MainActivity
   cold launch directly to the populated sample tabs.
8. Today, Assets, Family, and Vault smoke checks.
9. Light-surface status-icon contrast.
10. A consolidated scan across eight build-6 logcat captures: `PluralRules=0`,
    `SQL=0`, `Native=0`, and `React=0`; no Heldat ANR was observed.

No deep link or manual second navigation was used to obtain either passing
cold-resume result. The encrypted database and WAL/SHM remained present.

### Inherited capability evidence, not rerun on build 6

The build-6 delta only changes the signed-sample cold-bootstrap route and its
tests. The following device-capability journeys were **not rerun on build 6**:

- camera deny, retry, grant, capture, and return;
- Android Photo Picker privacy and import;
- location deny, retry, precise grant, GPS accuracy truth, exact-pin
  confirmation, and offline map behavior;
- signed-out reminder disabled state, no permission prompt, and no alarm.

Those capability branches passed on build 4 of the unchanged signed lineage.
Quick Passport, Settings, and route-aware status-bar confirmation passed on
build 5. This inherited evidence supports regression confidence but does not
replace physical-device or Play-distributed build-6 parity testing.

## Evidence inventory and integrity

| Record | Path | SHA-256 / result |
|---|---|---|
| Build 6 artifact record | `D:\HeldatArtifacts\current\faa751a\build6-artifact-hashes-and-records.json` | `C3C320A51B400442A5EB4C600D0113E2D293E2234D07F8BA838CCA2ED8C3F0C1` |
| Build 6 static summary | `D:\HeldatArtifacts\current\faa751a\build6-static-verification-summary.json` | `985E78DD35FFF532646FC59BDF4D0C449E40F19A19ED6D583165D8FF529CE182`; `69/69`, no failed checks, no secret-leak files |
| Runtime report | `D:\HeldatAndroidRuntime\evidence\ANDROID_RUNTIME_VALIDATION_2026-07-31.md` | `0BEB0768F4BDC804585F37FE4BB09E0431728D89046FD138207A7565DFDB6CC3` |
| Runtime evidence manifest | `D:\HeldatAndroidRuntime\evidence\ANDROID_RUNTIME_VALIDATION_2026-07-31.sha256` | `AEE12462323A938A737F0D23EF32A6E2803BBCB7DFF8F3D9677313ED897842F7`; `230` entries, `0` failures, report cross-check true |
| Build 6 runtime evidence root | `D:\HeldatAndroidRuntime\evidence\official-v6-faa751a8` | Screenshots, accessibility trees, launch records, DB evidence, and eight logcat captures |
| Consolidated error scan | `D:\HeldatAndroidRuntime\evidence\official-v6-faa751a8\07-consolidated-error-scan.txt` | `16431962939797BC86B17D459643E826865F22AA059FA27D96C69F0F8775D0F1`; all categories zero |

## Remaining gates

### Android distribution

1. Install the exact build-6 APK on representative physical Android devices
   and rerun the critical journey, interruptions, permissions, large text,
   TalkBack, background/foreground, and offline/reconnect cases.
2. Upload the exact build-6 AAB to the approved Play test track, record the
   Play App Signing certificate, and update/verify App Links and Maps key
   restrictions for that certificate.
3. Prove parity on the exact Play-delivered split APK set before expanding the
   test cohort.

### iOS distribution

1. Activate the Apple developer membership/signing path.
2. Produce a signed physical-device/TestFlight build from the approved source.
3. Rerun the core journey, camera/photo/document import, location, persistence,
   background/foreground reconciliation, VoiceOver, Dynamic Type, Arabic RTL,
   privacy shielding, associated domains, and universal links.

### Data durability and backend changes

1. Obtain explicit approval for a real encrypted database-plus-private-Storage
   backup, verify it outside the active-project boundary, and complete an
   isolated restore drill.
2. After the backup gate, separately approve and deploy migration
   `202607310007`, then witness and record retention/blob-maintenance results.
3. After migration 007 verification, separately approve and deploy migration
   `202607310008`, then verify storage counters, readiness telemetry,
   account-deletion holds, and rollback independently of Edge code.
4. After migration 008 verification, approve target `202607310010`. Use the
   checksum-pinned wrapper to record legacy `009` as superseded without running
   its SQL, then apply only 010. If 009 is already recorded, apply 010
   immediately; never leave its legacy reader exposed for a verification pause.
5. Prove the old signature is absent, only `service_role` executes the
   two-argument reader, and owner/editor/viewer plus denied/deleted tenant cases
   pass. Then separately approve the Edge API deploy.
   Run the public probe, then the opt-in authenticated `/household-storage`
   probe with an ephemeral token and synthetic household environment values.
6. For rollback, restore the prior Edge version first and rerun the public
   probe. Keep migrations 008 and 010; any database reversal requires a newly
   reviewed forward migration and separate approval.
7. Enable database SSL enforcement and reviewed network restrictions after
   the migration verification gates.

### Email, legal, stores, and 10K readiness

1. Complete `docs/operations/TRANSACTIONAL_EMAIL_LAUNCH_GATE.md`: Brevo sender
   identity/domain authentication, Supabase custom SMTP, aligned delivered
   headers, and tested signup, confirmation, recovery, and invitation delivery.
2. Supply and approve privacy policy, terms, support, business postal address,
   store listing, reviewer identity, age/content declarations, and developer
   account/payment details.
3. Replace the controlled-pilot storage envelope before public 10K expansion.
   The current `800 MiB` app allowance supports at most `20` households at the
   declared `40 MiB` allowance; the verified three-request public probe is not
   authenticated sync/upload or 10K throughput evidence.
4. Complete representative authenticated sync/upload/download/bootstrap,
   conflict, cleanup, export, projected-10K database, bot/abuse, Security and
   Performance Advisor, metrics, alerting, crash, on-call, quota, backup
   freshness, storage, egress, and cost gates.

Public mobile distribution and a 10K launch decision remain gated until these
controls have dated evidence.
