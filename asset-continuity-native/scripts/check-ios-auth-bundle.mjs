import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import process from "node:process";

/**
 * These strings are emitted only by the Android Google OAuth browser bridge.
 * Deliberately avoid broad terms such as `google`, `googleOAuth`, and provider
 * enum values: the shared auth adapter and localized copy contain those even
 * when the iOS runtime has no configured third-party provider.
 */
export const ANDROID_GOOGLE_OAUTH_RUNTIME_MARKERS = Object.freeze([
  "Heldat Google OAuth requires the signed native callback.",
  "openAuthSessionAsync",
  "preferEphemeralSession"
]);
export const HERMES_BYTECODE_MAGIC = Buffer.from(
  "c61fbc03c103191f",
  "hex"
);

export function isHermesBytecodeBundle(bundleBytes) {
  if (!Buffer.isBuffer(bundleBytes) && !(bundleBytes instanceof Uint8Array)) {
    return false;
  }
  return Buffer.from(bundleBytes)
    .subarray(0, HERMES_BYTECODE_MAGIC.length)
    .equals(HERMES_BYTECODE_MAGIC);
}

export function findAndroidGoogleOAuthRuntimeMarkers(bundleBytes) {
  if (!Buffer.isBuffer(bundleBytes) && !(bundleBytes instanceof Uint8Array)) {
    throw new TypeError("iOS bundle input must be bytes.");
  }

  const bytes = Buffer.from(bundleBytes);
  return ANDROID_GOOGLE_OAUTH_RUNTIME_MARKERS.filter((marker) =>
    bytes.includes(Buffer.from(marker, "utf8"))
  );
}

function main() {
  const bundlePath = process.argv[2]?.trim();
  if (!bundlePath) {
    process.stderr.write(
      "Usage: node scripts/check-ios-auth-bundle.mjs <path-to-main.jsbundle>\n"
    );
    process.exitCode = 2;
    return;
  }

  let bundleBytes;
  try {
    bundleBytes = readFileSync(bundlePath);
  } catch (error) {
    process.stderr.write(
      `iOS bundle could not be read: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 2;
    return;
  }

  if (bundleBytes.length === 0) {
    process.stderr.write("iOS bundle is empty.\n");
    process.exitCode = 2;
    return;
  }
  if (!isHermesBytecodeBundle(bundleBytes)) {
    process.stderr.write(
      "iOS bundle is not the expected Hermes bytecode artifact.\n"
    );
    process.exitCode = 2;
    return;
  }

  const found = findAndroidGoogleOAuthRuntimeMarkers(bundleBytes);
  if (found.length > 0) {
    process.stderr.write(
      `iOS bundle contains Android-only Google OAuth runtime markers: ${found.join(", ")}\n`
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `iOS auth bundle gate passed: ${bundleBytes.length} bytes; Android-only Google OAuth runtime absent.\n`
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
