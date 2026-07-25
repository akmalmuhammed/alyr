import type {
  ContractError,
  SyncOperation,
  SyncPullResponse,
  SyncPushResponse
} from "@alyr/contracts"

import {
  HttpSyncTransport,
  type SyncFetch
} from "@/adapters/httpSyncTransport"

const operation: SyncOperation = {
  operationVersion: 1,
  operationId: "operation-1",
  householdId: "household-1",
  command: {
    commandVersion: 1,
    commandId: "command-1",
    idempotencyKey: "idempotency-1",
    householdId: "household-1",
    actorMemberId: "member-1",
    deviceId: "device-1",
    type: "asset.create",
    aggregateId: "asset-1",
    observedVersion: 0,
    occurredAt: "2026-07-25T10:00:00.000Z",
    payload: { assetId: "asset-1" }
  },
  prerequisites: [{ kind: "blob-stored", blobObjectId: "blob-1" }],
  status: "queued",
  attemptCount: 0,
  nextAttemptAt: null,
  lastErrorCode: null,
  createdAt: "2026-07-25T10:00:00.000Z",
  updatedAt: "2026-07-25T10:00:00.000Z"
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function fetchMock() {
  return jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>()
}

describe("HttpSyncTransport", () => {
  it("pushes versioned operations with an access token", async () => {
    const response: SyncPushResponse = {
      acknowledgedOperationIds: ["operation-1"],
      conflicts: [],
      cursor: {
        cursorVersion: 1,
        value: "12",
        issuedAt: "2026-07-25T10:00:01.000Z"
      }
    }
    const fetchImpl = fetchMock()
    fetchImpl.mockResolvedValue(jsonResponse(response))
    const getAccessToken = jest.fn(async () => "access-token")
    const transport = new HttpSyncTransport({
      baseUrl: "https://edge.example.test/api/",
      getAccessToken,
      fetchImpl
    })

    await expect(transport.push([operation])).resolves.toEqual({
      ok: true,
      value: response
    })
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe("https://edge.example.test/api/sync/push")
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer access-token",
        "Content-Type": "application/json"
      }
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      apiVersion: 1,
      operations: [operation]
    })
  })

  it("pulls from an encoded household and opaque cursor", async () => {
    const response: SyncPullResponse = {
      changes: [
        {
          sequence: 13,
          entityType: "asset",
          entityId: "asset-1",
          householdId: "household/with spaces",
          version: 2,
          tombstoned: false,
          body: { name: "Watch" },
          changedAt: "2026-07-25T10:00:02.000Z"
        }
      ],
      cursor: {
        cursorVersion: 1,
        value: "cursor +/?",
        issuedAt: "2026-07-25T10:00:02.000Z"
      }
    }
    const fetchImpl = fetchMock()
    fetchImpl.mockResolvedValue(jsonResponse(response))
    const transport = new HttpSyncTransport({
      baseUrl: "https://edge.example.test/api",
      getAccessToken: async () => "access-token",
      fetchImpl
    })

    await expect(
      transport.pull("household/with spaces", {
        cursorVersion: 1,
        value: "cursor +/?",
        issuedAt: null
      })
    ).resolves.toEqual({ ok: true, value: response })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(
      "https://edge.example.test/api/sync/pull?" +
        "householdId=household%2Fwith%20spaces&cursor=cursor%20%2B%2F%3F"
    )
    expect(init).toEqual({
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer access-token"
      }
    })
  })

  it("returns a valid versioned ContractError from an HTTP failure", async () => {
    const error: ContractError = {
      errorVersion: 1,
      code: "RATE_LIMITED",
      message: "Try again shortly.",
      retryable: true,
      details: { retryAfterSeconds: 30 }
    }
    const fetchImpl = fetchMock()
    fetchImpl.mockResolvedValue(jsonResponse({ error }, 429))
    const transport = new HttpSyncTransport({
      baseUrl: "https://edge.example.test/api",
      getAccessToken: async () => "access-token",
      fetchImpl
    })

    await expect(transport.push([operation])).resolves.toEqual({
      ok: false,
      error
    })
  })

  it("converts network failures to retryable OFFLINE results", async () => {
    const fetchImpl = fetchMock()
    fetchImpl.mockRejectedValue(new TypeError("Network request failed"))
    const transport = new HttpSyncTransport({
      baseUrl: "https://edge.example.test/api",
      getAccessToken: async () => "access-token",
      fetchImpl
    })

    const result = await transport.pull("household-1", {
      cursorVersion: 1,
      value: null,
      issuedAt: null
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({
        errorVersion: 1,
        code: "OFFLINE",
        retryable: true
      })
    }
  })

  it("rejects a malformed success as VALIDATION_FAILED", async () => {
    const fetchImpl = fetchMock()
    fetchImpl.mockResolvedValue(
      jsonResponse({
        acknowledgedOperationIds: "operation-1",
        conflicts: [],
        cursor: { cursorVersion: 1, value: "1", issuedAt: null }
      })
    )
    const transport = new HttpSyncTransport({
      baseUrl: "https://edge.example.test/api",
      getAccessToken: async () => "access-token",
      fetchImpl
    })

    const result = await transport.push([operation])

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({
        errorVersion: 1,
        code: "VALIDATION_FAILED",
        retryable: false
      })
    }
  })

  it("does not trust an unversioned or unknown error payload", async () => {
    const fetchImpl = fetchMock()
    fetchImpl.mockResolvedValue(
      jsonResponse(
        {
          error: {
            errorVersion: 2,
            code: "SOME_PROVIDER_ERROR",
            message: "Provider detail",
            retryable: true
          }
        },
        500
      )
    )
    const transport = new HttpSyncTransport({
      baseUrl: "https://edge.example.test/api",
      getAccessToken: async () => "access-token",
      fetchImpl
    })

    const result = await transport.push([operation])

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED")
    }
  })
})
