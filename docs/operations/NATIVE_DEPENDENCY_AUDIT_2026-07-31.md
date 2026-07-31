# Heldat native dependency audit — 2026-07-31

## Release decision

**Build 6 passes the native dependency and executable-payload gate.** This
permits progression to physical Android-device and Play-delivered parity
testing; it is not a public-distribution approval.

The dependency graph was reviewed at source commit
`82e9f856b59fda7c9490531a864842f6010fc9ba` for the `@alyr/native` workspace.
There are no package manifest or lockfile changes from that commit through the
build-6 source commit `faa751a86d73021c2883bf1deb31f5b9ae8e8bee`, so the
same dependency decision applies to build 6.

The exact committed graph returned:

```text
info 0 · low 0 · moderate 12 · high 22 · critical 0
```

The critical-threshold audit exited `0`. npm's 34 propagated entries collapse
to the two reviewed tooling advisories below. Neither dependency path is
included in the build-6 mobile runtime executable payload.

## Time-bounded tooling exceptions

| Advisory | Present path | Runtime assessment | Follow-up |
|---|---|---|---|
| [`brace-expansion` OOM DoS](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | Jest/test coverage reached through the optional testing peer of `expo-router` | Build/test process only. Native production source does not import the affected tooling. | Recheck when Expo/Jest publish a compatible dependency path. Do not force `brace-expansion@5` across packages that require 1.x. |
| [`uuid` supplied-buffer bounds issue](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | `xcode` under Expo config/prebuild tooling | Build process only. The affected API is UUID v3/v5/v6 with a supplied buffer; the reviewed caller uses v4. | Recheck when `xcode` accepts `uuid >=11.1.1`. Do not force a four-major override. |

`npm audit fix --force` is prohibited for this release because its proposed
Expo/Jest changes are incompatible downgrades rather than reviewed
remediation.

## Build 6 artifact verification

- Source: `faa751a86d73021c2883bf1deb31f5b9ae8e8bee`
- Production AAB EAS ID: `7db5077a-f866-40e1-807c-b4eb32afbfeb`
- Preview APK EAS ID: `21657ca8-8f37-4fc0-94f4-6e50995654fc`
- Fingerprint: `019fb8af-c863-7073-8f09-005a060979e5` /
  `7ae0a98ef3705af37415a790c136cee0504838fb`
- Dual-artifact static gate: `69/69` checks passed.
- Denied executable markers in the AAB: `0`.
- Denied executable markers in the APK: `0`.
- Secret-leak file results: `0`.
- Both artifacts include Hermes, SQLCipher, and crypto native libraries for
  `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`.
- Static summary:
  `D:\HeldatArtifacts\current\faa751a\build6-static-verification-summary.json`
- Static summary SHA-256:
  `985E78DD35FFF532646FC59BDF4D0C449E40F19A19ED6D583165D8FF529CE182`

The executable-payload scan explicitly found none of these reviewed
build/test markers:

- `@testing-library/react-native`
- `jest-config`, `jest-runtime`, or `brace-expansion`
- `@expo/config-plugins`, `@expo/cli`, or `xcode`

The separate Expo 54 `asset-continuity-ios-preview` workspace is outside the
Heldat release package. Its PostCSS build-tool advisory remains a separate
upgrade item; that workspace must not process untrusted CSS or become a store
artifact.

## Review deadline

Recheck this exception on the next Expo/Jest/xcode upgrade, on any package or
lockfile change, or by **2026-08-31**, whichever happens first.
