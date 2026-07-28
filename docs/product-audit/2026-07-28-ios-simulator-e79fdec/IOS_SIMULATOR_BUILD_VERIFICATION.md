# ALYR EAS iOS Simulator Build Verification — e79fdec

**Inspection date:** 2026-07-28
**Result:** `FINISHED / VERIFIED / INSPECTED`
**Build:** [`71351749-9f72-42ba-86d2-e2b4156827f0`](https://expo.dev/accounts/alyr-app/projects/alyr-asset-continuity/builds/71351749-9f72-42ba-86d2-e2b4156827f0)

This is an independently downloaded and inspected iOS Simulator development
artifact. It proves that the current native source produces an `ALYR.app` for
the iOS Simulator. It is not physical-iPhone, Apple-provisioning, ad hoc,
TestFlight, App Store, live-migration, live-Edge, or visual-walkthrough
evidence.

## Source and build identity

- EAS source commit:
  `e79fdec052d85354c83910d61b64d30e14802230`
  (`docs: refresh iPhone preview handoff`).
- Canonical executable app source:
  `691e4e6d97842927985e0cd4f01ee085cf3805a0`.
- `e79fdec` is the direct child of `691e4e6`; their diff contains only release
  documentation and audit artifacts, with no executable app-source change.
- Status/platform/distribution: `FINISHED` / `IOS` / `INTERNAL`.
- Profile/channel: `development-simulator` / `development`.
- SDK/app/build/runtime: `57.0.0` / `0.1.0` / `1` / `0.1.0`.
- Simulator flag: `true`.
- EAS fingerprint:
  `f45936120c262589173d1b39551c2e8ed61f866f`
  (`019fa8ae-feab-78a2-ad94-6dd402476d43`).
- Completed at `2026-07-28T12:32:42.005Z`.

## Downloaded archive

- Artifact:
  [`4Bf9U4x95x1eRksKC9LOfFf11yJ959abF-6dimJATYQ.tar.gz`](https://expo.dev/artifacts/eas/4Bf9U4x95x1eRksKC9LOfFf11yJ959abF-6dimJATYQ.tar.gz)
- Size: **58,277,627 bytes**
- SHA-256:
  `93C85B130CFE6195502ABDAE546BF895F18502E07622D89AA26C34C5C768480F`
- Contents: **146 members** — 98 files and 48 directories, rooted only at
  `ALYR.app`.
- No unsafe archive path, symlink, hard link, or embedded provisioning profile
  was present.

## Embedded iOS configuration

### `ALYR.app/Info.plist`

- Size: **2,518 bytes**
- SHA-256:
  `516F6071AA7A2D31DEFFF386A5EBDE24D471B99AC725129BD8F605354687B346`
- Bundle/version/build: `com.alyr.continuity` / `0.1.0` / `1`.
- Target: `iPhoneSimulator`; `UIDeviceFamily = [1]`; minimum iOS `16.4`.
- `ITSAppUsesNonExemptEncryption = false`.
- `NSAllowsArbitraryLoads = false`.
- Development-only `NSAllowsLocalNetworking = true`, `_expo._tcp` Bonjour
  discovery, and the dev-launcher URL scheme are present as expected for this
  development-client build.
- Camera, selected-photo, in-use location, local-network, and Face ID purpose
  strings are present.
- Background task wiring is present:
  `UIBackgroundModes = [fetch, processing]` and
  `BGTaskSchedulerPermittedIdentifiers =
  [com.expo.modules.backgroundtask.processing]`.

### `ALYR.app/Expo.plist`

- Size: **368 bytes**
- SHA-256:
  `92A26BC756146F4A5578582F8EEE76CA5264351AEDAEDECF2459FBA283153A9F`
- EAS Update is enabled.
- Runtime: `0.1.0`.
- Channel request header: `development`.
- Update URL:
  `https://u.expo.dev/85cab1f2-111f-4e20-abd5-8dff0df2fabb`.

### `ALYR.app/PrivacyInfo.xcprivacy`

- Size: **5,518 bytes**
- SHA-256:
  `38EB64B2FA739A83F72CDAC50374F1448112B43A2FDFB065183DE07F56A4165B`
- The embedded manifest is a normalized exact match to the resolved source
  configuration.
- Tracking is `false`; tracking domains are empty.
- All **11** collected-data declarations are account-linked and marked
  non-tracking. Ten use App Functionality; Product Interaction uses Analytics.
- The four required-reason API categories and reviewed reasons are present:
  file timestamps (`C617.1`, `3B52.1`), user defaults (`CA92.1`), system boot
  time (`35F9.1`), and disk space (`E174.1`, `85F4.1`).

## Log inspection

| Log | Stored evidence | Decoded evidence | Result |
|---|---|---|---|
| EAS worker | 65,132 bytes; SHA-256 `944099FC5D87ABCE16F97B7FAD2B71504FA4454C5E1467E8B3022C59AC46E09E` | 528,972 bytes; SHA-256 `9B2372D195C57830AE55195B3E5C010FBF10821F3B8CE08AB4971C0640C0AC75` | 1,730 JSON lines; zero level-40-or-higher records; exact profile, EAS commit, SDK, runtime, and channel confirmed |
| Xcode | 215,080 bytes; SHA-256 `5B7158958BEE74E02274F760551D64D8AA67D3925B9B2FCABC7F9CE057341B27` | 17,285,029 bytes; SHA-256 `05A070F4FF04796D916E3019B13EE9FA3EDCCC253319DCA41A764094F97478E9` | 89,626 lines; zero error/fatal lines; one `BUILD SUCCEEDED`; zero `BUILD FAILED` |

Xcode emitted **3,929 warning lines**: 2,542 from prebuilt dependency
headers, 1,080 from `node_modules`, 258 from Pods/build phases, 48 from
toolchain/other output, and one ALYR-target build-phase output-dependency
warning. The EAS summary also reported two missing Metal-toolchain search-path
warnings and a future Ruby 3.2 support warning. These did not fail the build,
but they remain build-maintenance debt.

## Gates that remain open

- Physical-iPhone installation and complete accessibility/product walkthrough.
- Apple team, registered device, physical-device signing, ad hoc preview, and
  TestFlight/App Store artifacts.
- Inspection of release stripping for the development-only local-network,
  Bonjour, and dev-launcher configuration.
- Current Supabase migrations and Edge Function deployment/live verification.
- Chrome-based visual validation and the real iPhone Expo Go walkthrough.

The machine-readable evidence is in [`verification.json`](./verification.json).
