import assert from "node:assert/strict";
import test from "node:test";

import { readBoundedJsonObject } from "../functions/_shared/requestBody.ts";

function jsonRequest(body, headers = {}) {
  return new Request("https://fixture.invalid/functions/v1/api/sync/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
    body,
    duplex: "half",
  });
}

test("bounded JSON reader accepts a streamed object without Content-Length", async () => {
  const encoder = new TextEncoder();
  const request = jsonRequest(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"api'));
      controller.enqueue(encoder.encode('Version":1}'));
      controller.close();
    },
  }));

  assert.deepEqual(await readBoundedJsonObject(request, 32), { apiVersion: 1 });
});

test("bounded JSON reader cancels a chunked body as soon as the ceiling is crossed", async () => {
  const encoder = new TextEncoder();
  let cancelReason = "";
  const request = jsonRequest(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("{\"a\":"));
      controller.enqueue(encoder.encode("12345}"));
    },
    cancel(reason) {
      cancelReason = String(reason);
    },
  }));

  await assert.rejects(
    readBoundedJsonObject(request, 8),
    /REQUEST_TOO_LARGE/u,
  );
  assert.match(cancelReason, /exceeded its byte limit/u);
});

test("oversize cleanup preserves the intended error when stream cancellation fails", async () => {
  const retainedChunk = new TextEncoder().encode("{\"a\":");
  const request = jsonRequest(new ReadableStream({
    start(controller) {
      controller.enqueue(retainedChunk);
      controller.enqueue(new TextEncoder().encode("12345}"));
    },
    cancel() {
      throw new Error("fixture cancel failure");
    },
  }));

  await assert.rejects(
    readBoundedJsonObject(request, 8),
    /REQUEST_TOO_LARGE/u,
  );
  assert.deepEqual([...retainedChunk], [0, 0, 0, 0, 0]);
});

test("bounded JSON reader rejects oversized declarations before consuming bytes", async () => {
  const request = jsonRequest(new ReadableStream({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode("{}"));
      controller.close();
    },
  }), { "Content-Length": "1025" });

  await assert.rejects(
    readBoundedJsonObject(request, 1024),
    /REQUEST_TOO_LARGE/u,
  );
});

test("bounded JSON reader rejects ambiguous transport and non-object JSON", async () => {
  await assert.rejects(
    readBoundedJsonObject(
      jsonRequest("{}", { "Content-Type": "text/application/json-evil" }),
    ),
    /CONTENT_TYPE_REQUIRED/u,
  );
  await assert.rejects(
    readBoundedJsonObject(jsonRequest("{}", { "Content-Encoding": "gzip" })),
    /CONTENT_ENCODING_UNSUPPORTED/u,
  );
  await assert.rejects(
    readBoundedJsonObject(jsonRequest("[]")),
    /INVALID_JSON/u,
  );
});

test("both API entry paths use the streaming reader rather than Request.text", async () => {
  const { readFile } = await import("node:fs/promises");
  const [api, exportsApi] = await Promise.all([
    readFile(new URL("../functions/api/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/api/export.ts", import.meta.url), "utf8"),
  ]);
  assert.match(api, /readBoundedJsonObject\(request\)/u);
  assert.match(exportsApi, /readBoundedJsonObject\(request, 64 \* 1024\)/u);
  assert.doesNotMatch(api, /request\.text\(\)/u);
  assert.doesNotMatch(exportsApi, /request\.text\(\)/u);
});
