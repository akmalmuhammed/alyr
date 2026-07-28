import { getLocationPolicy } from "@alyr/domain";

import naturalEarthCoastline from "../assets/atlas/ne_110m_coastline_mobile.json";
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

export interface PreparedAtlasPolyline {
  readonly points: readonly AtlasCoordinates[];
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

interface NaturalEarthCoastlineFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly {
    readonly type: "Feature";
    readonly geometry: {
      readonly type: "LineString";
      readonly coordinates: readonly (readonly [number, number])[];
    };
  }[];
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

export function prepareAtlasPolyline(
  points: readonly AtlasCoordinates[],
): PreparedAtlasPolyline {
  for (const point of points) {
    assertCoordinate(point, "An Atlas line point");
  }
  return { points: densifyPolyline(points) };
}

function projectPreparedPoints(
  dense: readonly AtlasCoordinates[],
  center: AtlasCoordinates
): readonly (readonly AtlasProjection[])[] {
  if (dense.length < 2) return [];
  const segments: AtlasProjection[][] = [];
  let current: AtlasProjection[] = [];
  let previousPoint = dense[0]!;
  const previousProjection = projectOnAtlas(previousPoint, center);
  let previousVisible =
    previousProjection.depth >= -horizonTolerance;
  if (previousVisible) current.push(previousProjection);

  for (let index = 1; index < dense.length; index += 1) {
    const point = dense[index]!;
    const projection = projectOnAtlas(point, center);
    const visible = projection.depth >= -horizonTolerance;

    if (previousVisible && visible) {
      current.push(projection);
    } else if (previousVisible && !visible) {
      current.push(projectionAtHorizon(previousPoint, point, center));
      if (current.length >= 2) segments.push(current);
      current = [];
    } else if (!previousVisible && visible) {
      current = [
        projectionAtHorizon(previousPoint, point, center),
        projection
      ];
    }

    previousPoint = point;
    previousVisible = visible;
  }

  if (current.length >= 2) segments.push(current);
  return segments;
}

/**
 * Projects prevalidated, predensified geography without repeating fixed work
 * during every interactive Atlas frame.
 */
export function projectPreparedAtlasPolyline(
  prepared: PreparedAtlasPolyline,
  center: AtlasCoordinates
): readonly (readonly AtlasProjection[])[] {
  assertCoordinate(center, "The Atlas center");
  return projectPreparedPoints(prepared.points, center);
}

/**
 * Projects an arbitrary coastline or graticule and splits it at the visible
 * horizon. Every returned point is safe to draw inside the unit globe.
 */
export function projectAtlasPolyline(
  points: readonly AtlasCoordinates[],
  center: AtlasCoordinates
): readonly (readonly AtlasProjection[])[] {
  return projectPreparedAtlasPolyline(
    prepareAtlasPolyline(points),
    center
  );
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
 * Natural Earth 1:110m coastline, bundled for deterministic offline rendering.
 * Source data is public domain and remains presentation-only: ALYR never uses
 * coastline geometry to infer, adjust, or validate a household Place pin.
 */
export const ATLAS_COASTLINE_SOURCE = {
  name: "Natural Earth 1:110m Coastline",
  version: "4.1.0",
  repositoryCommit: "ca96624a56bd078437bca8184e78163e5039ad19",
  sourceUrl:
    "https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_110m_coastline.geojson",
  mobileSimplification: "Ramer-Douglas-Peucker · 0.75° tolerance",
  publicDomain: true
} as const;

const naturalEarthCoastlineData =
  naturalEarthCoastline as unknown as NaturalEarthCoastlineFeatureCollection;

function loadNaturalEarthCoastlines(): readonly (readonly AtlasCoordinates[])[] {
  if (naturalEarthCoastlineData.type !== "FeatureCollection") {
    throw new Error("The bundled Natural Earth coastline is invalid.");
  }

  return naturalEarthCoastlineData.features.map((feature) => {
    if (feature.geometry.type !== "LineString") {
      throw new Error("The bundled Natural Earth coastline is not a line dataset.");
    }

    return feature.geometry.coordinates.map(([longitude, latitude]) => {
      const coordinate = { latitude, longitude };
      assertCoordinate(coordinate, "A Natural Earth coastline point");
      return coordinate;
    });
  });
}

export const ATLAS_COASTLINES = loadNaturalEarthCoastlines();

function createGraticule(): readonly (readonly AtlasCoordinates[])[] {
  const lines: AtlasCoordinates[][] = [];
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const line: AtlasCoordinates[] = [];
    for (let longitude = -180; longitude <= 180; longitude += 10) {
      line.push({
        latitude,
        longitude: longitude === 180 ? 179.999999 : longitude
      });
    }
    lines.push(line);
  }
  for (let longitude = -150; longitude <= 180; longitude += 30) {
    const line: AtlasCoordinates[] = [];
    for (let latitude = -80; latitude <= 80; latitude += 10) {
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
export const ATLAS_COASTLINE_RENDER_LINES =
  ATLAS_COASTLINES.map(prepareAtlasPolyline);
export const ATLAS_GRATICULE_RENDER_LINES =
  ATLAS_GRATICULE.map(prepareAtlasPolyline);
