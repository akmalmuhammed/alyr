import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync
} from "node:fs";
import { fileURLToPath } from "node:url";

const toleranceDegrees = 0.75;
const sourcePath = fileURLToPath(
  new URL(
    "../src/assets/atlas/ne_110m_coastline.json",
    import.meta.url
  )
);
const outputPath = fileURLToPath(
  new URL(
    "../src/assets/atlas/ne_110m_coastline_mobile.json",
    import.meta.url
  )
);
const source = JSON.parse(readFileSync(sourcePath, "utf8"));

function unwrappedCoordinates(coordinates) {
  const unwrapped = [];
  let previousLongitude = null;
  for (const [rawLongitude, rawLatitude] of coordinates) {
    let longitude = Number(rawLongitude);
    if (previousLongitude !== null) {
      while (longitude - previousLongitude > 180) longitude -= 360;
      while (longitude - previousLongitude < -180) longitude += 360;
    }
    unwrapped.push([longitude, Number(rawLatitude)]);
    previousLongitude = longitude;
  }
  return unwrapped;
}

function pointSegmentDistance(point, from, to, longitudeScale) {
  const pointX = point[0] * longitudeScale;
  const fromX = from[0] * longitudeScale;
  const toX = to[0] * longitudeScale;
  const deltaX = toX - fromX;
  const deltaY = to[1] - from[1];
  if (deltaX === 0 && deltaY === 0) {
    return Math.hypot(pointX - fromX, point[1] - from[1]);
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      ((pointX - fromX) * deltaX +
        (point[1] - from[1]) * deltaY) /
        (deltaX * deltaX + deltaY * deltaY)
    )
  );
  return Math.hypot(
    pointX - (fromX + progress * deltaX),
    point[1] - (from[1] + progress * deltaY)
  );
}

function simplifyLine(coordinates) {
  const points = unwrappedCoordinates(coordinates);
  if (points.length <= 2) return points;

  const meanLatitude =
    points.reduce((total, point) => total + point[1], 0) /
    points.length;
  const longitudeScale = Math.max(
    0.15,
    Math.cos((meanLatitude * Math.PI) / 180)
  );
  const keptIndexes = new Set([0, points.length - 1]);
  const segments = [[0, points.length - 1]];

  while (segments.length > 0) {
    const [start, end] = segments.pop();
    let farthestDistance = -1;
    let farthestIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = pointSegmentDistance(
        points[index],
        points[start],
        points[end],
        longitudeScale
      );
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestDistance > toleranceDegrees) {
      keptIndexes.add(farthestIndex);
      segments.push([start, farthestIndex], [farthestIndex, end]);
    }
  }

  return [...keptIndexes]
    .sort((left, right) => left - right)
    .map((index) => points[index]);
}

function rounded(value) {
  const result = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(result, -0) ? 0 : result;
}

function normalizedLongitude(value) {
  let longitude = value;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;
  return rounded(longitude);
}

const features = source.features.map((feature) => ({
  type: "Feature",
  properties: feature.properties ?? {},
  geometry: {
    type: "LineString",
    coordinates: simplifyLine(feature.geometry.coordinates).map(
      ([longitude, latitude]) => [
        normalizedLongitude(longitude),
        rounded(latitude)
      ]
    )
  }
}));
const output = {
  type: "FeatureCollection",
  name: "ne_110m_coastline_mobile",
  features
};
const serialized = `${JSON.stringify(output)}\n`;
writeFileSync(outputPath, serialized, "utf8");

process.stdout.write(
  `${JSON.stringify(
    {
      features: features.length,
      points: features.reduce(
        (total, feature) =>
          total + feature.geometry.coordinates.length,
        0
      ),
      bytes: Buffer.byteLength(serialized),
      sha256: createHash("sha256").update(serialized).digest("hex"),
      toleranceDegrees
    },
    null,
    2
  )}\n`
);
