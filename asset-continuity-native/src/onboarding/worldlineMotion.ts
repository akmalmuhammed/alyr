import {
  projectOnAtlas,
  type AtlasCoordinates
} from "@/domain/atlas";

export const WORLDLINE_MOTION = {
  reduceMotionCrossfadeMs: 80,
  smallStateMs: 160,
  markerSettleMs: 280,
  sceneMs: 480,
  globeRevealMs: 1_180
} as const;

export type OnboardingAssetKind =
  | "document"
  | "home"
  | "watch";

export interface WorldlineGlobeMarker {
  readonly id: string;
  readonly label: string;
  readonly kind: OnboardingAssetKind;
  readonly coordinate: AtlasCoordinates;
  /**
   * Where the example object begins, expressed as a fraction of the visual
   * canvas. This is presentation-only and never represents a saved Place.
   */
  readonly origin: {
    readonly x: number;
    readonly y: number;
  };
}

export interface WorldlineCanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface ProjectedWorldlineMarker extends WorldlineGlobeMarker {
  readonly destination: WorldlineCanvasPoint;
  readonly originPoint: WorldlineCanvasPoint;
  readonly visible: boolean;
  readonly depth: number;
}

export interface WorldlineMarkerTiming {
  readonly depart: number;
  readonly arrive: number;
  readonly settle: number;
}

export const DEFAULT_ONBOARDING_GLOBE_CENTER: AtlasCoordinates = {
  latitude: 23,
  longitude: 37
};

/**
 * Clearly synthetic examples for the onboarding explanation. Callers using
 * real saved records must pass their own markers and set `example={false}`.
 */
export const DEFAULT_ONBOARDING_GLOBE_MARKERS:
  readonly WorldlineGlobeMarker[] = [
    {
      id: "example-watch",
      label: "Watch",
      kind: "watch",
      coordinate: { latitude: 25.2854, longitude: 51.531 },
      origin: { x: 0.08, y: 0.74 }
    },
    {
      id: "example-home",
      label: "Home",
      kind: "home",
      coordinate: { latitude: 51.5072, longitude: -0.1276 },
      origin: { x: 0.82, y: 0.18 }
    },
    {
      id: "example-document",
      label: "Document",
      kind: "document",
      coordinate: { latitude: -1.2864, longitude: 36.8172 },
      origin: { x: 0.88, y: 0.72 }
    }
  ] as const;

function assertCanvasSize(canvasSize: number, globeInset: number): void {
  if (
    !Number.isFinite(canvasSize) ||
    canvasSize <= 0 ||
    !Number.isFinite(globeInset) ||
    globeInset < 0 ||
    globeInset * 2 >= canvasSize
  ) {
    throw new Error(
      "Worldline globe geometry requires a positive canvas and a valid inset."
    );
  }
}

/**
 * Converts geographic markers into fixed screen points once per layout/center
 * change. Coastlines and destinations therefore stay off the animation path.
 */
export function projectWorldlineMarkers(
  markers: readonly WorldlineGlobeMarker[],
  center: AtlasCoordinates,
  canvasSize: number,
  globeInset: number
): readonly ProjectedWorldlineMarker[] {
  assertCanvasSize(canvasSize, globeInset);

  const sphereRadius = (canvasSize - globeInset * 2) / 2;
  const projectionRadius = Math.max(1, sphereRadius - 17);
  const sphereCenter = canvasSize / 2;

  return markers.map((marker) => {
    if (
      !Number.isFinite(marker.origin.x) ||
      marker.origin.x < 0 ||
      marker.origin.x > 1 ||
      !Number.isFinite(marker.origin.y) ||
      marker.origin.y < 0 ||
      marker.origin.y > 1
    ) {
      throw new Error(
        "A Worldline marker origin must be a unit-canvas coordinate."
      );
    }
    const projection = projectOnAtlas(marker.coordinate, center);
    return {
      ...marker,
      destination: {
        x: sphereCenter + projection.x * projectionRadius,
        y: sphereCenter + projection.y * projectionRadius
      },
      originPoint: {
        x: marker.origin.x * canvasSize,
        y: marker.origin.y * canvasSize
      },
      visible: projection.visible,
      depth: projection.depth
    };
  });
}

/**
 * Staggers a small number of objects while reserving the final part of the
 * timeline for a calm, shared confirmation. The result is deterministic and
 * remains valid when a caller supplies fewer or more markers.
 */
export function worldlineMarkerTiming(
  index: number,
  count: number
): WorldlineMarkerTiming {
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    count <= 0 ||
    index < 0 ||
    index >= count
  ) {
    throw new Error("Worldline marker timing requires a valid index and count.");
  }

  const stagger = count === 1 ? 0 : (index / (count - 1)) * 0.2;
  const depart = 0.16 + stagger;
  const arrive = Math.min(0.76, depart + 0.34);

  return {
    depart,
    arrive,
    settle: Math.min(0.92, arrive + 0.12)
  };
}

/**
 * A restrained orbit derived from the visual bounds, not from record data.
 * It is intentionally presentation-only and must never be used as a geographic
 * route, distance, or provenance claim.
 */
export function worldlineOrbitPath(
  canvasSize: number,
  globeInset: number
): string {
  assertCanvasSize(canvasSize, globeInset);

  const x = (fraction: number) => (canvasSize * fraction).toFixed(2);
  const y = (fraction: number) => (canvasSize * fraction).toFixed(2);

  return [
    `M ${x(-0.03)} ${y(0.30)}`,
    `C ${x(0.12)} ${y(0.02)}, ${x(0.45)} ${y(0.05)}, ${x(0.66)} ${y(0.24)}`,
    `C ${x(0.92)} ${y(0.45)}, ${x(0.94)} ${y(0.72)}, ${x(0.67)} ${y(0.83)}`,
    `C ${x(0.45)} ${y(0.92)}, ${x(0.21)} ${y(0.79)}, ${x(0.18)} ${y(0.59)}`
  ].join(" ");
}

export function estimateWorldlineOrbitLength(canvasSize: number): number {
  if (!Number.isFinite(canvasSize) || canvasSize <= 0) {
    throw new Error("Worldline orbit length requires a positive canvas.");
  }
  return canvasSize * 2.62;
}
