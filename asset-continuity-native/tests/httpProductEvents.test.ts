import { createPrivacySafeEvent } from "@alyr/analytics";

import { HttpProductEventTransport } from "@/adapters/httpProductEvents";

const householdId = "95000000-0000-4000-8000-000000000001";
const idempotencyKey =
  "95000000-0000-4000-8000-000000000002";
const event = createPrivacySafeEvent(
  "asset_retrieval_completed",
  {
    schemaVersion: 1,
    platform: "android",
    appVersion: "0.1.0",
    locale: "en",
    occurredOffline: true,
    resultEntityType: "asset",
    retrievalSource: "asset-list"
  }
);

describe("authenticated product-event HTTP transport", () => {
  it("sends only routing, idempotency, event name, and allow-listed properties", async () => {
    const fetchImpl = jest.fn(async (_url: string, init: RequestInit) =>
      new Response(
        JSON.stringify({
          apiVersion: 1,
          accepted: true,
          idempotencyKey
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    const transport = new HttpProductEventTransport({
      baseUrl: "https://example.test/functions/v1/api/",
      householdId,
      getAccessToken: async () => "short-lived-user-bearer",
      fetchImpl
    });

    await expect(
      transport.record({ idempotencyKey, event })
    ).resolves.toEqual({ ok: true, value: undefined });
    const [url, request] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://example.test/functions/v1/api/product-events"
    );
    expect(request.headers).toMatchObject({
      Authorization: "Bearer short-lived-user-bearer"
    });
    expect(JSON.parse(String(request.body))).toEqual({
      apiVersion: 1,
      householdId,
      idempotencyKey,
      eventName: "asset_retrieval_completed",
      properties: event.payload
    });
  });

  it("keeps a retryable event pending when the API is offline", async () => {
    const transport = new HttpProductEventTransport({
      baseUrl: "https://example.test/functions/v1/api",
      householdId,
      getAccessToken: async () => "short-lived-user-bearer",
      fetchImpl: async () => {
        throw new Error("offline");
      }
    });
    await expect(
      transport.record({ idempotencyKey, event })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "OFFLINE", retryable: true }
    });
  });

  it("rejects a malformed acknowledgement instead of deleting the queue row", async () => {
    const transport = new HttpProductEventTransport({
      baseUrl: "https://example.test/functions/v1/api",
      householdId,
      getAccessToken: async () => "short-lived-user-bearer",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            apiVersion: 1,
            accepted: true,
            idempotencyKey:
              "95000000-0000-4000-8000-000000000099"
          }),
          {
            status: 202,
            headers: { "Content-Type": "application/json" }
          }
        )
    });
    await expect(
      transport.record({ idempotencyKey, event })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
  });
});
