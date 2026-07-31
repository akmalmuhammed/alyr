# Heldat launch-control handoff — 2026-07-31

This snapshot records verified controls only. It contains no credentials or
secret values.

## Verified state

| Control | Verified result | Release consequence |
|---|---|---|
| Public TLS | `https://heldat.app` is live. Cloudflare minimum TLS is `1.2`; a TLS 1.0 probe exited `35`, while TLS 1.2 returned HTTP `200`. | TLS versions below 1.2 are rejected. |
| HTTPS enforcement | **Always Use HTTPS** is enabled. Plain HTTP returns `301` to HTTPS. | Public web traffic is redirected to HTTPS. |
| HTTPS headers | HTTPS responses include HSTS `max-age=31536000; includeSubDomains`, CSP, `X-Content-Type-Options: nosniff`, Referrer-Policy and Permissions-Policy. | The verified edge security-header baseline is active. |
| DNSSEC | Spaceship accepted the exact DS record below and displayed `DS record added successfully`. Public Google DNS returned status `0`, `AD=True` and the exact DS; Cloudflare reports `Success! heldat.app is protected with DNSSEC.` | DNSSEC publication and public validation are complete. |
| Email authentication | Cloudflare serves the exact `_dmarc.heldat.app` monitoring record below, and Google Public DNS returned it exactly (`DMARC_PUBLIC=verified`). | The non-blocking DMARC monitoring baseline is complete; enforcement and transactional sending remain pending. |
| Supabase database transport | The pooler route completed certificate verification over TLS 1.3 using AES-256-GCM. | Keep certificate verification enabled for operator database connections. |
| Backup operator access | The Windows DPAPI operator vault was updated. The real-project `backup --dry-run` passed with `writes: false`. | The preflight is ready; no actual backup or restore drill has run. |
| iOS simulator | Fresh simulator artifact verified as detailed below. | Simulator evidence is current, but it is not a physical-device or App Store binary. |
| Android | The hardened production AAB and installable preview APK both passed integrity, package/version, signing-certificate continuity and payload checks as detailed below. | The AAB is the Play upload candidate and the APK is the pilot handoff. Physical-device and Play-track acceptance remain release gates. |

## DNSSEC verified state

Spaceship accepted these exact fields: key tag `2371`, algorithm `13`
(`ECDSA-SHA256`), digest type `2` (`SHA256`) and the digest below.

```text
heldat.app. 3600 IN DS 2371 13 2 BA918EC223C1EE65100CB5E98121F81A84A7D1C40FC36776A02BF69C58D4B324
```

Public Google DNS returned `DNS_STATUS=0`, `AD=True` and the exact DS record.
Cloudflare now reports `Success! heldat.app is protected with DNSSEC.`

## Email authentication baseline

Cloudflare now serves this public DMARC monitoring record:

```text
v=DMARC1; p=none; rua=mailto:security@heldat.app; adkim=r; aspf=r; fo=1; pct=100
```

Google Public DNS returned the exact value (`DMARC_PUBLIC=verified`). This
`p=none` policy collects monitoring reports and does not enforce quarantine or
rejection. Tighten enforcement only after Brevo SPF, DKIM and sender alignment
are verified and the DMARC reports have been reviewed. Transactional SMTP and
the transactional sender address remain pending.

## Fresh iOS simulator artifact

- EAS build: `f5e5bc9c-4217-4597-9917-2a2287276aee`
- Source commit: `eccba3bf4bae708e5b463b872b789e5586bce9df`
- Archive: `output/release/heldat-ios-simulator-v0.1.0-build1-eccba3b-f5e5bc9c.tar.gz`
- SHA-256: `717686EB6C7DE438073DAEED8C7B0CE61C5E2D3FEE28AC0302175E05F136A106`
- Archive verification: `136` entries; gzip/tar integrity passed
- App identity: `app.heldat.mobile`; Heldat `0.1.0` (`1`)
- Runtime: iOS minimum `16.4`; simulator architectures `x86_64` and `arm64`
- Verified metadata: privacy manifest, required privacy usage strings, URL
  schemes and development-update configuration are present
- Known boundary: the simulator signature has no universal-link entitlement;
  validate associated domains and universal links again in a signed physical
  device/TestFlight build

## Fresh Android artifacts

- Production EAS build: `0877527d-c5e6-4939-be1c-197078a2b8cc`
- Source commit: `eccba3bf4bae708e5b463b872b789e5586bce9df`
- AAB: `output/release/heldat-android-production-eccba3b-v0.1.0-build3.aab`
- Bytes: `130447511`
- SHA-256: `F597345DC2F14B1AA69C6D2B08A22C07A0AD91597B0F83C75383A0474CE45D13`
- App identity: `app.heldat.mobile`; Heldat `0.1.0` (`versionCode 3`)
- Android SDK: minimum `24`; target `36`
- Verification passed: bundletool, every ZIP CRC, jarsigner,
  upload-certificate continuity and Expo Doctor `20/20`
- Static package scan: `1,557` archive entries and `123` executable
  payloads inspected; reviewed build/test advisory packages were absent
- Distribution boundary: the production AAB is a Play upload artifact, not a
  directly installable APK
- Preview APK EAS build: `721dc7f5-ff91-478e-a4b6-a0f021ab4ef1` — `FINISHED`
- APK: `output/release/heldat-android-preview-eccba3b-v0.1.0-build3.apk`
- APK bytes: `183288180`
- APK SHA-256: `5DD4BCE19959261D00DC21453B9CE69E26E56CE6B484E6CCCF230E2C6DEAFDDE`
- APK verification passed: identity/version, SDK 24/36, APK Signature Scheme
  v2, known certificate continuity, 16 KiB page alignment, all `1484` ZIP
  entries, four ABIs and the standalone Hermes bundle
- Install page:
  `https://expo.dev/accounts/alyr-app/projects/alyr-asset-continuity/builds/721dc7f5-ff91-478e-a4b6-a0f021ab4ef1`

## Owner actions

| Owner | Next action | Completion evidence |
|---|---|---|
| Email owner | Configure the Brevo transactional sender, SPF, DKIM and alignment; review DMARC reports before proposing a stricter policy. | Verified transactional SMTP/address, aligned SPF and DKIM results, reviewed DMARC reports and an approved enforcement change. |
| Operations owner | Obtain explicit approval for `backup --execute`, verify the encrypted backup, then run a separately approved restore drill against a disposable project. | Dated backup ID, offline verification result and successful restore/verify-restore record. |
| iOS release owner | Produce a signed physical-device/TestFlight build from the approved source and test associated-domain entitlements and universal links. | Signed build ID, source commit, artifact checksum and device test record. |
| Android release owner | Run the verified APK on the intended pilot devices. Upload the exact AAB to the Play internal track only after release approval, then record the Play App Signing certificate and update App Links/Maps restrictions for it. | Dated physical-device results, internal-track release record and Play signing fingerprints tied to version `0.1.0 (3)`. |
| Release owner | Keep public mobile distribution gated until the pending backup/restore, signed physical-iOS and Android physical-device evidence is reviewed. | Dated release decision linked to all completed evidence. |
