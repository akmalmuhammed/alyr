import assert from "node:assert/strict";
import test from "node:test";

import {
  ANDROID_GOOGLE_OAUTH_RUNTIME_MARKERS,
  HERMES_BYTECODE_MAGIC,
  findAndroidGoogleOAuthRuntimeMarkers,
  isHermesBytecodeBundle
} from "./check-ios-auth-bundle.mjs";

test("accepts an iOS bundle containing shared provider copy only", () => {
  const sharedCopy = Buffer.from(
    "Continue with Google public_email_google googleOAuth provider",
    "utf8"
  );

  assert.deepEqual(findAndroidGoogleOAuthRuntimeMarkers(sharedCopy), []);
});

test("reports each Android-only OAuth runtime marker", () => {
  const androidRuntime = Buffer.from(
    ANDROID_GOOGLE_OAUTH_RUNTIME_MARKERS.join("\u0000"),
    "utf8"
  );

  assert.deepEqual(
    findAndroidGoogleOAuthRuntimeMarkers(androidRuntime),
    ANDROID_GOOGLE_OAUTH_RUNTIME_MARKERS
  );
});

test("rejects non-byte inputs", () => {
  assert.throws(
    () => findAndroidGoogleOAuthRuntimeMarkers("not bytes"),
    /must be bytes/u
  );
});

test("recognizes only a Hermes bytecode bundle header", () => {
  assert.equal(
    isHermesBytecodeBundle(
      Buffer.concat([HERMES_BYTECODE_MAGIC, Buffer.from("payload")])
    ),
    true
  );
  assert.equal(isHermesBytecodeBundle(Buffer.from("plain js")), false);
  assert.equal(isHermesBytecodeBundle("not bytes"), false);
});
