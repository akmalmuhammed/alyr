import { getLocationPolicy } from "@alyr/domain";

import type { NativeAsset } from "./model";
import { isAssetActive } from "./model";

export interface AtlasCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface AtlasProjection {
  /** Horizontal position in a unit circle, from -1 to 1. */
  readonly x: number;
  /** Vertical position in a unit circle, from -1 to 1. */
  readonly y: number;
  /** True when the point is on the visible hemisphere. */
  readonly visible: boolean;
  /** Dot product with the viewing direction, from -1 to 1. */
  readonly depth: number;
}

export type AtlasLocationSource =
  | "device_gps"
  | "user_pin"
  | "manual_coordinates"
  | "not_set";

export interface AtlasPinDisclosure {
  readonly locationSource: AtlasLocationSource;
  readonly precision: "exact" | "user_placed" | "approximate" | "locality_only";
  readonly horizontalAccuracyMeters: number | null;
  readonly confirmedAt: string | null;
}

const degreesToRadians = Math.PI / 180;
const horizonTolerance = 1e-9;

/**
 * Returns only active records that genuinely need a physical retrieval Place.
 * Digital references intentionally remain unplaced and must never inflate the
 * Atlas location-work count.
 */
export function assetsNeedingPhysicalPlace(
  assets: readonly NativeAsset[]
): readonly NativeAsset[] {
  return assets.filter(
    (asset) =>
      isAssetActive(asset) &&
      asset.placeId === null &&
      getLocationPolicy(asset.categoryId).requiresPhysicalLocator
  );
}

function assertCoordinate(
  value: AtlasCoordinates,
  label: string
): void {
  if (
    !Number.isFinite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    !Number.isFinite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180
  ) {
    throw new Error(`${label} must contain valid latitude and longitude.`);
  }
}

function normalizedLongitude(longitude: number): number {
  const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function shortestLongitudeDelta(from: number, to: number): number {
  return normalizedLongitude(to - from);
}

function interpolateCoordinate(
  from: AtlasCoordinates,
  to: AtlasCoordinates,
  progress: number
): AtlasCoordinates {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: normalizedLongitude(
      from.longitude +
        shortestLongitudeDelta(from.longitude, to.longitude) * progress
    )
  };
}

/**
 * Orthographically projects a geographic coordinate onto a unit globe.
 *
 * This is an overview projection only. Retrieval and boundary decisions must
 * continue to use the confirmed Place pin rather than screen pixels.
 */
export function projectOnAtlas(
  point: AtlasCoordinates,
  center: AtlasCoordinates
): AtlasProjection {
  assertCoordinate(point, "The Atlas point");
  assertCoordinate(center, "The Atlas center");

  const latitude = point.latitude * degreesToRadians;
  const longitudeDelta =
    shortestLongitudeDelta(center.longitude, point.longitude) *
    degreesToRadians;
  const centerLatitude = center.latitude * degreesToRadians;

  const latitudeCosine = Math.cos(latitude);
  const centerLatitudeCosine = Math.cos(centerLatitude);
  const centerLatitudeSine = Math.sin(centerLatitude);
  const longitudeCosine = Math.cos(longitudeDelta);

  const x = latitudeCosine * Math.sin(longitudeDelta);
  const y = -(
    centerLatitudeCosine * Math.sin(latitude) -
    centerLatitudeSine * latitudeCosine * longitudeCosine
  );
  const depth =
    centerLatitudeSine * Math.sin(latitude) +
    centerLatitudeCosine * latitudeCosine * longitudeCosine;
  const normalizedX = Math.abs(x) < 1e-12 ? 0 : x;
  const normalizedY = Math.abs(y) < 1e-12 ? 0 : y;

  return {
    x: Math.max(-1, Math.min(1, normalizedX)),
    y: Math.max(-1, Math.min(1, normalizedY)),
    visible: depth >= -Number.EPSILON,
    depth: Math.max(-1, Math.min(1, depth))
  };
}

function densifyPolyline(
  points: readonly AtlasCoordinates[],
  maximumStepDegrees = 4
): AtlasCoordinates[] {
  if (points.length < 2) return [...points];

  const dense: AtlasCoordinates[] = [points[0]!];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const angularDistance = Math.max(
      Math.abs(to.latitude - from.latitude),
      Math.abs(shortestLongitudeDelta(from.longitude, to.longitude))
    );
    const stepCount = Math.max(
      1,
      Math.ceil(angularDistance / maximumStepDegrees)
    );
    for (let step = 1; step <= stepCount; step += 1) {
      dense.push(interpolateCoordinate(from, to, step / stepCount));
    }
  }
  return dense;
}

function projectionAtHorizon(
  from: AtlasCoordinates,
  to: AtlasCoordinates,
  center: AtlasCoordinates
): AtlasProjection {
  const fromIsVisible = projectOnAtlas(from, center).depth >= 0;
  let lower = 0;
  let upper = 1;

  for (let iteration = 0; iteration < 28; iteration += 1) {
    const middle = (lower + upper) / 2;
    const middleIsVisible =
      projectOnAtlas(interpolateCoordinate(from, to, middle), center).depth >=
      0;
    if (middleIsVisible === fromIsVisible) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  const projection = projectOnAtlas(
    interpolateCoordinate(from, to, (lower + upper) / 2),
    center
  );
  return {
    ...projection,
    visible: true,
    depth: 0
  };
}

/**
 * Projects a coastline or graticule and splits it at the visible horizon.
 * Every returned point is safe to draw inside the unit globe.
 */
export function projectAtlasPolyline(
  points: readonly AtlasCoordinates[],
  center: AtlasCoordinates
): readonly (readonly AtlasProjection[])[] {
  assertCoordinate(center, "The Atlas center");
  for (const point of points) {
    assertCoordinate(point, "An Atlas line point");
  }
  if (points.length < 2) return [];

  const dense = densifyPolyline(points);
  const segments: AtlasProjection[][] = [];
  let current: AtlasProjection[] = [];

  for (let index = 0; index < dense.length; index += 1) {
    const point = dense[index]!;
    const projection = projectOnAtlas(point, center);
    const visible = projection.depth >= -horizonTolerance;

    if (index === 0) {
      if (visible) current.push(projection);
      continue;
    }

    const previousPoint = dense[index - 1]!;
    const previousProjection = projectOnAtlas(previousPoint, center);
    const previousVisible =
      previousProjection.depth >= -horizonTolerance;

    if (previousVisible && visible) {
      current.push(projection);
      continue;
    }

    if (previousVisible && !visible) {
      current.push(projectionAtHorizon(previousPoint, point, center));
      if (current.length >= 2) segments.push(current);
      current = [];
      continue;
    }

    if (!previousVisible && visible) {
      current = [
        projectionAtHorizon(previousPoint, point, center),
        projection
      ];
    }
  }

  if (current.length >= 2) segments.push(current);
  return segments;
}

export function atlasCenter(
  selected: AtlasCoordinates | null,
  points: readonly AtlasCoordinates[]
): AtlasCoordinates {
  if (selected) {
    assertCoordinate(selected, "The selected Atlas point");
    return selected;
  }

  if (points.length === 0) {
    return { latitude: 25.2854, longitude: 51.531 };
  }

  for (const point of points) {
    assertCoordinate(point, "An Atlas point");
  }

  // A vector mean behaves correctly around the international date line.
  const vector = points.reduce(
    (sum, point) => {
      const latitude = point.latitude * degreesToRadians;
      const longitude = point.longitude * degreesToRadians;
      const latitudeCosine = Math.cos(latitude);
      return {
        x: sum.x + latitudeCosine * Math.cos(longitude),
        y: sum.y + latitudeCosine * Math.sin(longitude),
        z: sum.z + Math.sin(latitude)
      };
    },
    { x: 0, y: 0, z: 0 }
  );

  const horizontal = Math.hypot(vector.x, vector.y);
  if (horizontal < Number.EPSILON && Math.abs(vector.z) < Number.EPSILON) {
    return points[0]!;
  }

  return {
    latitude: Math.atan2(vector.z, horizontal) / degreesToRadians,
    longitude: Math.atan2(vector.y, vector.x) / degreesToRadians
  };
}

/**
 * Applies a direct globe drag. The result is presentation state only and
 * never mutates a Place pin.
 */
export function moveAtlasCenter(
  center: AtlasCoordinates,
  deltaX: number,
  deltaY: number,
  diameter: number
): AtlasCoordinates {
  assertCoordinate(center, "The Atlas center");
  if (
    !Number.isFinite(deltaX) ||
    !Number.isFinite(deltaY) ||
    !Number.isFinite(diameter) ||
    diameter <= 0
  ) {
    throw new Error("Atlas movement requires finite deltas and diameter.");
  }

  return {
    latitude: Math.max(
      -85,
      Math.min(85, center.latitude + (deltaY / diameter) * 90)
    ),
    longitude: normalizedLongitude(
      center.longitude - (deltaX / diameter) * 180
    )
  };
}

/**
 * Describes only the evidence that exists. In particular, a manually placed
 * pin never inherits GPS accuracy language from its precision enum.
 */
export function atlasPinDisclosure(
  location: AtlasPinDisclosure
): string {
  const accuracy =
    location.horizontalAccuracyMeters !== null &&
    Number.isFinite(location.horizontalAccuracyMeters) &&
    location.horizontalAccuracyMeters >= 0
      ? Math.round(location.horizontalAccuracyMeters)
      : null;

  if (location.precision === "locality_only") {
    return location.confirmedAt === null
      ? "Locality only · confirmation needed"
      : "Locality only · no precise pin";
  }

  if (
    location.locationSource === "user_pin" ||
    location.locationSource === "manual_coordinates"
  ) {
    return location.confirmedAt === null
      ? "Manually placed pin · confirmation needed"
      : "Manually placed pin · no measured GPS accuracy";
  }

  if (location.locationSource === "device_gps") {
    const method =
      location.precision === "approximate" ? "Approximate GPS pin" : "GPS pin";
    if (location.confirmedAt === null) {
      return `${method} · confirmation needed`;
    }
    return accuracy === null
      ? `${method} confirmed · accuracy not recorded`
      : `${method} confirmed · measured accuracy ±${accuracy} m`;
  }

  return location.confirmedAt === null
    ? "Pin source not recorded · confirmation needed"
    : "Pin source not recorded";
}

/**
 * Purpose-built, low-resolution coastlines for orientation at mobile scale.
 * These are stored locally, contain no political borders, and are not a
 * cadastral or navigation dataset.
 */
export const ATLAS_COASTLINES: readonly (readonly AtlasCoordinates[])[] = [
  [
    { latitude: 72, longitude: -168 },
    { latitude: 70, longitude: -145 },
    { latitude: 60, longitude: -135 },
    { latitude: 54, longitude: -130 },
    { latitude: 49, longitude: -124 },
    { latitude: 38, longitude: -123 },
    { latitude: 29, longitude: -115 },
    { latitude: 22, longitude: -106 },
    { latitude: 18, longitude: -96 },
    { latitude: 25, longitude: -89 },
    { latitude: 30, longitude: -82 },
    { latitude: 44, longitude: -66 },
    { latitude: 52, longitude: -56 },
    { latitude: 60, longitude: -64 },
    { latitude: 66, longitude: -82 },
    { latitude: 72, longitude: -110 },
    { latitude: 72, longitude: -168 }
  ],
  [
    { latitude: 60, longitude: -46 },
    { latitude: 68, longitude: -52 },
    { latitude: 78, longitude: -58 },
    { latitude: 83, longitude: -35 },
    { latitude: 76, longitude: -18 },
    { latitude: 66, longitude: -30 },
    { latitude: 60, longitude: -46 }
  ],
  [
    { latitude: 12, longitude: -81 },
    { latitude: 5, longitude: -77 },
    { latitude: -6, longitude: -79 },
    { latitude: -18, longitude: -70 },
    { latitude: -33, longitude: -72 },
    { latitude: -55, longitude: -68 },
    { latitude: -52, longitude: -58 },
    { latitude: -35, longitude: -53 },
    { latitude: -20, longitude: -40 },
    { latitude: -5, longitude: -35 },
    { latitude: 6, longitude: -52 },
    { latitude: 12, longitude: -65 },
    { latitude: 12, longitude: -81 }
  ],
  [
    { latitude: 36, longitude: -10 },
    { latitude: 44, longitude: -9 },
    { latitude: 52, longitude: -5 },
    { latitude: 61, longitude: 6 },
    { latitude: 71, longitude: 25 },
    { latitude: 70, longitude: 58 },
    { latitude: 76, longitude: 105 },
    { latitude: 67, longitude: 140 },
    { latitude: 56, longitude: 162 },
    { latitude: 47, longitude: 145 },
    { latitude: 39, longitude: 129 },
    { latitude: 23, longitude: 121 },
    { latitude: 10, longitude: 106 },
    { latitude: 5, longitude: 99 },
    { latitude: 8, longitude: 78 },
    { latitude: 23, longitude: 68 },
    { latitude: 26, longitude: 56 },
    { latitude: 30, longitude: 48 },
    { latitude: 36, longitude: 38 },
    { latitude: 41, longitude: 27 },
    { latitude: 36, longitude: -10 }
  ],
  [
    { latitude: 37, longitude: -10 },
    { latitude: 35, longitude: 10 },
    { latitude: 31, longitude: 34 },
    { latitude: 22, longitude: 37 },
    { latitude: 12, longitude: 44 },
    { latitude: 0, longitude: 42 },
    { latitude: -12, longitude: 40 },
    { latitude: -25, longitude: 35 },
    { latitude: -35, longitude: 20 },
    { latitude: -34, longitude: 17 },
    { latitude: -24, longitude: 14 },
    { latitude: -8, longitude: 12 },
    { latitude: 5, longitude: 10 },
    { latitude: 15, longitude: -17 },
    { latitude: 28, longitude: -17 },
    { latitude: 37, longitude: -10 }
  ],
  [
    { latitude: 31, longitude: 34 },
    { latitude: 30, longitude: 48 },
    { latitude: 26, longitude: 56 },
    { latitude: 16, longitude: 52 },
    { latitude: 12, longitude: 44 },
    { latitude: 20, longitude: 39 },
    { latitude: 31, longitude: 34 }
  ],
  [
    { latitude: -11, longitude: 113 },
    { latitude: -20, longitude: 114 },
    { latitude: -35, longitude: 116 },
    { latitude: -39, longitude: 146 },
    { latitude: -28, longitude: 154 },
    { latitude: -16, longitude: 146 },
    { latitude: -11, longitude: 130 },
    { latitude: -11, longitude: 113 }
  ],
  [
    { latitude: 34, longitude: 130 },
    { latitude: 38, longitude: 136 },
    { latitude: 44, longitude: 145 }
  ],
  [
    { latitude: -13, longitude: 49 },
    { latitude: -24, longitude: 48 },
    { latitude: -26, longitude: 44 },
    { latitude: -13, longitude: 49 }
  ],
  [
    { latitude: -35, longitude: 172 },
    { latitude: -42, longitude: 174 },
    { latitude: -47, longitude: 168 }
  ]
] as const;

function createGraticule(): readonly (readonly AtlasCoordinates[])[] {
  const lines: AtlasCoordinates[][] = [];
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const line: AtlasCoordinates[] = [];
    for (let longitude = -180; longitude <= 180; longitude += 5) {
      line.push({
        latitude,
        longitude: longitude === 180 ? 179.999999 : longitude
      });
    }
    lines.push(line);
  }
  for (let longitude = -150; longitude <= 180; longitude += 30) {
    const line: AtlasCoordinates[] = [];
    for (let latitude = -85; latitude <= 85; latitude += 5) {
      line.push({
        latitude,
        longitude: longitude === 180 ? 179.999999 : longitude
      });
    }
    lines.push(line);
  }
  return lines;
}

export const ATLAS_GRATICULE = createGraticule();
