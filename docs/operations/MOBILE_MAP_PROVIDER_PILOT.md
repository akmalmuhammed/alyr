# Heldat zero-payment mobile map provider pilot

Date: 2026-08-01

## Decision

Use `@maplibre/maplibre-react-native` `11.3.6` for native iOS/Android map
rendering and OpenFreeMap's public Liberty style:

```text
https://tiles.openfreemap.org/styles/liberty
```

This removes the native app's Google Maps SDK/key configuration and the need
for a billing-enabled map project during the closed pilot. It does not create
an availability guarantee: OpenFreeMap's public service is provided as-is and
has no SLA.

## Product behavior

- `PlacePinEditor` uses MapLibre `Map`, `Camera`, and a draggable
  `ViewAnnotation`.
- Longitude/latitude ordering at the renderer boundary is converted back to
  Heldat's latitude/longitude domain command without changing provenance.
- A drag remains `user_pin` / `user_placed`, clears measured GPS accuracy, and
  requires confirmation again.
- The existing map, marker, coordinate-field, and confirmation test IDs remain
  stable.
- MapLibre's attribution control remains enabled and a visible label names
  OpenFreeMap, OpenMapTiles, and OpenStreetMap.
- A load failure or 12-second stall removes the untrusted blank map and shows
  the existing precision-honest coordinate readout. Manual coordinates and
  foreground `expo-location` remain usable; copy points back to the Places
  list.
- `expo-network` `57.0.1` supplies the native operating-system connectivity
  state and change listener. An initial `{}`/unknown state is neutral; only an
  explicit `isConnected === false` or `isInternetReachable === false` switches
  the editor to the coordinate fallback.
- If a ready map loses connectivity, the fallback appears immediately and is
  latched until the editor remounts. Reconnection does not silently resume map
  requests inside the current editor session. Heldat adds no reachability
  request, tile polling, tile prefetch, or offline pack.
- On iOS, each asynchronous transition into the fallback is announced once
  through `AccessibilityInfo`; the existing polite Android live-region
  semantics remain present.
- There is no geocoding, Places autocomplete, offline pack, bulk tile download,
  or tile prefetch feature in this pilot.

## Native configuration boundary

- Expo config plugin: `@maplibre/maplibre-react-native`.
- Android location engine: `default`, not the Google Play Services engine.
- Foreground GPS: `expo-location`, unchanged.
- Connectivity state: `expo-network` `57.0.1`; its hook owns and cleans up the
  native change listener when the editor unmounts.
- The Expo module's Android library manifest adds the normal permissions
  `android.permission.ACCESS_NETWORK_STATE` and
  `android.permission.ACCESS_WIFI_STATE`. Neither is a runtime permission;
  both must still be reconciled against the final merged manifest.
- Legacy `react-native-maps`: absent from `@alyr/native` dependencies.
- Legacy `GOOGLE_MAPS_ANDROID_API_KEY` and `android.config.googleMaps`: absent.
- Production manifest gate rejects `com.google.android.geo.API_KEY` metadata.
- MapLibre requires a development/native build; it does not run inside Expo Go.

## Operations and scaling

The OpenFreeMap public instance is the zero-payment pilot adapter. Before a
larger public rollout, measure map success/failure latency and request volume,
review provider policy changes, and keep the style URL behind a future provider
adapter. A self-hosted or contracted tile service can replace it without
changing Heldat's exact-location domain model.

Map/network failure must never block saving authoritative coordinates. The app
must not silently switch providers, infer a Place, or download offline regions.

## Validation gates

1. Focused component tests: style URL, attribution, camera coordinate order,
   drag provenance, explicit failure, stall timeout, ready-to-offline change,
   neutral initial unknown state, fallback latching, and one iOS announcement
   per transition.
2. Exact-location contract and English/Arabic management tests.
3. TypeScript and complete native Jest suite.
4. Expo public/production config, EAS packaging, and recovery-crypto gates.
5. Clean Android prebuild and native dependency/manifest inspection.
6. Android compile when the local SDK/Gradle environment permits it.
7. Physical Android and iPhone checks with map networking on/off before store
   promotion.

## Primary references

- MapLibre Expo setup: <https://maplibre.org/maplibre-react-native/docs/setup/expo/>
- Map component/events/attribution: <https://maplibre.org/maplibre-react-native/docs/components/map/>
- Camera: <https://maplibre.org/maplibre-react-native/docs/components/camera/>
- Draggable ViewAnnotation: <https://maplibre.org/maplibre-react-native/docs/components/annotations/view-annotation/>
- OpenFreeMap mobile/Liberty quick start and attribution: <https://openfreemap.org/quick_start/>
- OpenFreeMap service terms: <https://openfreemap.org/tos/>
- OpenFreeMap privacy policy: <https://openfreemap.org/privacy/>
