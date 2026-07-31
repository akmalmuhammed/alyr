import { HttpHouseholdStorage } from "@/adapters/httpHouseholdStorage";

const householdId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherHouseholdId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const currentMeasuredAt = new Date().toISOString();

function payload(overrides: Record<string, unknown> = {}) {
  return {
    householdId,
    source: "server-confirmed",
    usedBytes: 48 * 1024 * 1024,
    allowanceBytes: 40 * 1024 * 1024,
    measuredAt: currentMeasuredAt,
    ...overrides
  };
}

function serverResponse(
  body: unknown,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "private, no-store");
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

describe("HttpHouseholdStorage", () => {
  it("uses a fresh bearer and no-store GET for every measurement", async () => {
    const getAccessToken = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce("first-bearer")
      .mockResolvedValueOnce("second-bearer");
    const fetchImpl = jest.fn(
      async (_url: string, _init: RequestInit) =>
        serverResponse(payload())
    );
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://project-ref.supabase.co/functions/v1/api/",
      getAccessToken,
      fetchImpl
    });

    await expect(adapter.getUsage(householdId)).resolves.toEqual({
      ok: true,
      value: payload()
    });
    await expect(adapter.getUsage(householdId)).resolves.toEqual({
      ok: true,
      value: payload()
    });

    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [index, expectedBearer] of [
      "first-bearer",
      "second-bearer"
    ].entries()) {
      const [url, init] = fetchImpl.mock.calls[index]!;
      const headers = new Headers(init.headers);
      expect(url).toBe(
        `https://project-ref.supabase.co/functions/v1/api/household-storage?householdId=${householdId}`
      );
      expect(init.method).toBe("GET");
      expect(init.cache).toBe("no-store");
      expect(init.redirect).toBe("error");
      expect(headers.get("Authorization")).toBe(
        `Bearer ${expectedBearer}`
      );
      expect(headers.get("Cache-Control")).toBe("no-store");
      expect(headers.get("Accept")).toBe("application/json");
    }
  });

  it("accepts a strict server report even when usage is over allowance", async () => {
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () => serverResponse(payload())
    });

    const result = await adapter.getUsage(householdId);
    expect(result).toEqual({ ok: true, value: payload() });
    if (result.ok) {
      expect(result.value.usedBytes).toBeGreaterThan(
        result.value.allowanceBytes
      );
    }
  });

  it.each([
    ["missing field", (() => {
      const { measuredAt: _measuredAt, ...value } = payload();
      return value;
    })()],
    ["extra field", payload({ cached: true })],
    ["numeric string", payload({ usedBytes: "10" })],
    ["negative allowance", payload({ allowanceBytes: -1 })],
    ["zero allowance", payload({ allowanceBytes: 0 })],
    ["oversized usage", payload({ usedBytes: 1_099_511_627_777 })],
    ["oversized allowance", payload({ allowanceBytes: 1_099_511_627_777 })],
    ["unsafe integer", payload({ usedBytes: Number.MAX_SAFE_INTEGER + 1 })],
    ["wrong source", payload({ source: "device-estimated" })],
    ["invalid measurement time", payload({ measuredAt: "yesterday" })],
    ["measurement without timezone", payload({ measuredAt: "2026-08-01T00:00:00" })],
    ["invalid calendar date", payload({ measuredAt: "2026-02-30T00:00:00.000Z" })],
    ["invalid timezone offset", payload({ measuredAt: "2026-08-01T00:00:00+24:00" })],
    ["future measurement", payload({ measuredAt: "2099-08-01T00:00:00.000Z" })]
  ])("rejects a malformed %s response", async (_label, body) => {
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () => serverResponse(body)
    });

    await expect(adapter.getUsage(householdId)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
  });

  it("rejects a valid report for the wrong household", async () => {
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () =>
        serverResponse(payload({ householdId: otherHouseholdId }))
    });

    await expect(adapter.getUsage(householdId)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("normalizes a valid uppercase household identifier before comparing the response", async () => {
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async (url) => {
        expect(url).toContain(`householdId=${householdId}`);
        return serverResponse(payload());
      }
    });

    await expect(
      adapter.getUsage(householdId.toUpperCase())
    ).resolves.toEqual({ ok: true, value: payload() });
  });

  it.each([
    [
      "missing no-store",
      { "Content-Type": "application/json" }
    ],
    [
      "wrong content type",
      { "Cache-Control": "no-store", "Content-Type": "text/plain" }
    ],
    [
      "non-UTF-8 JSON charset",
      {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-16"
      }
    ]
  ])("rejects a %s response policy", async (_label, headers) => {
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () =>
        new Response(JSON.stringify(payload()), { status: 200, headers })
    });

    await expect(adapter.getUsage(householdId)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
  });

  it("rejects an oversized declared body before parsing it", async () => {
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () =>
        new Response(JSON.stringify(payload()), {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json",
            "Content-Length": "2049"
          }
        })
    });

    await expect(adapter.getUsage(householdId)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
  });

  it("cancels a streamed body that crosses the response ceiling", async () => {
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () =>
        new Response("x".repeat(3_000), {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json"
          }
        })
    });

    await expect(adapter.getUsage(householdId)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
  });

  it("supports the React Native non-stream response only with a verified bounded length", async () => {
    const body = JSON.stringify(payload());
    const text = jest.fn(async () => body);
    const response = {
      body: null,
      headers: new Headers({
        "Cache-Control": "no-store",
        "Content-Length": String(body.length),
        "Content-Type": "application/json; charset=utf-8"
      }),
      ok: true,
      status: 200,
      text
    } as unknown as Response;
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () => response
    });

    await expect(adapter.getUsage(householdId)).resolves.toEqual({
      ok: true,
      value: payload()
    });
    expect(text).toHaveBeenCalledTimes(1);
  });

  it("does not materialize a non-stream response without a bounded length", async () => {
    const text = jest.fn(async () => JSON.stringify(payload()));
    const response = {
      body: null,
      headers: new Headers({
        "Cache-Control": "no-store",
        "Content-Type": "application/json"
      }),
      ok: true,
      status: 200,
      text
    } as unknown as Response;
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () => response
    });

    await expect(adapter.getUsage(householdId)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
    expect(text).not.toHaveBeenCalled();
  });

  it("cancels a no-store non-success body before mapping its status", async () => {
    const response = new Response("session expired", {
      status: 401,
      headers: { "Cache-Control": "no-store" }
    });
    const cancel = jest.spyOn(response.body!, "cancel");
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () => response
    });

    await expect(adapter.getUsage(householdId)).resolves.toMatchObject({
      ok: false,
      error: { code: "SESSION_EXPIRED", retryable: true }
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects and cancels a cacheable non-success response", async () => {
    const response = new Response("session expired", { status: 401 });
    const cancel = jest.spyOn(response.body!, "cancel");
    const adapter = new HttpHouseholdStorage({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "bearer",
      fetchImpl: async () => response
    });

    await expect(adapter.getUsage(householdId)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
