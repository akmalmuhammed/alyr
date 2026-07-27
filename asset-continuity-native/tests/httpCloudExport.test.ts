import {
  HttpCloudExport,
  type ExportByteDigest
} from "@/adapters/httpCloudExport";
import type { CloudExportCreateRequest } from "@/data/cloudExport";
import type { ExportStatusResponse } from "@alyr/contracts";

const householdId = "11111111-1111-4111-8111-111111111111";
const exportId = "22222222-2222-4222-8222-222222222222";
const checksum = "a".repeat(64);

const request: CloudExportCreateRequest = {
  apiVersion: 1,
  householdId,
  format: "json-manifest",
  assetIds: [],
  redacted: false,
  idempotencyKey: "33333333-3333-4333-8333-333333333333"
};

const ready = {
  exportId,
  status: "ready" as const,
  blobObjectId: null,
  fileName: "alyr-continuity-2026-07-27.json",
  mimeType: "application/json",
  byteSize: 4,
  checksumSha256: checksum,
  expiresAt: "2026-08-03T12:00:00.000Z",
  completedAt: "2026-07-27T12:00:00.000Z",
  error: null
} satisfies ExportStatusResponse;

function response(
  payload: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("HttpCloudExport", () => {
  it("creates an idempotent authenticated export and parses a ready receipt", async () => {
    const fetchImpl = jest.fn(async () => response(ready, 201));
    const port = new HttpCloudExport({
      baseUrl: "https://project.supabase.co/functions/v1/api",
      getAccessToken: async () => "fresh-user-bearer",
      fetchImpl
    });

    const result = await port.create(request);

    expect(result).toEqual({ ok: true, value: ready });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/api/exports",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer fresh-user-bearer"
        }),
        body: JSON.stringify(request)
      })
    );
  });

  it("retrieves status without accepting provider object URLs", async () => {
    const processing = {
      exportId,
      status: "processing",
      blobObjectId: null,
      fileName: null,
      mimeType: null,
      byteSize: null,
      checksumSha256: null,
      expiresAt: null,
      completedAt: null,
      error: null
    };
    const fetchImpl = jest.fn(async () => response(processing));
    const port = new HttpCloudExport({
      baseUrl: "https://project.supabase.co/functions/v1/api/",
      getAccessToken: async () => "token",
      fetchImpl
    });

    await expect(port.get(exportId)).resolves.toEqual({
      ok: true,
      value: processing
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://project.supabase.co/functions/v1/api/exports/${exportId}`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("downloads bytes only after metadata and SHA-256 agree", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const digestBytes: ExportByteDigest = jest.fn(async () => checksum);
    const fetchImpl = jest.fn(async () =>
      new Response(bytes, {
        status: 200,
        headers: {
          "Content-Length": "4",
          "Content-Type": "application/json",
          "X-ALYR-Checksum-SHA256": checksum
        }
      })
    );
    const port = new HttpCloudExport({
      baseUrl: "https://project.supabase.co/functions/v1/api",
      getAccessToken: async () => "token",
      fetchImpl,
      digestBytes
    });

    const result = await port.download(ready);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fileName).toBe(ready.fileName);
      expect(result.value.mimeType).toBe("application/json");
      expect([...result.value.bytes]).toEqual([1, 2, 3, 4]);
    }
    expect(digestBytes).toHaveBeenCalledTimes(1);
  });

  it("rejects a download whose bytes fail the immutable checksum", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const port = new HttpCloudExport({
      baseUrl: "https://project.supabase.co/functions/v1/api",
      getAccessToken: async () => "token",
      fetchImpl: async () =>
        new Response(bytes, {
          status: 200,
          headers: {
            "Content-Length": "4",
            "Content-Type": "application/json",
            "X-ALYR-Checksum-SHA256": checksum
          }
        }),
      digestBytes: async () => "b".repeat(64)
    });

    await expect(port.download(ready)).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_FILE", retryable: false }
    });
  });

  it("fails closed on invalid requests, missing bearers and malformed status", async () => {
    const neverFetch = jest.fn();
    const port = new HttpCloudExport({
      baseUrl: "https://project.supabase.co/functions/v1/api",
      getAccessToken: async () => "",
      fetchImpl: neverFetch
    });
    await expect(
      port.create({ ...request, idempotencyKey: "short" })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
    await expect(port.create(request)).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
    expect(neverFetch).not.toHaveBeenCalled();

    const malformed = new HttpCloudExport({
      baseUrl: "https://project.supabase.co/functions/v1/api",
      getAccessToken: async () => "token",
      fetchImpl: async () =>
        response({
          ...ready,
          checksumSha256: "not-a-checksum"
        })
    });
    await expect(malformed.create(request)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("preserves a versioned API error without inventing a receipt", async () => {
    const port = new HttpCloudExport({
      baseUrl: "https://project.supabase.co/functions/v1/api",
      getAccessToken: async () => "token",
      fetchImpl: async () =>
        response(
          {
            error: {
              errorVersion: 1,
              code: "QUOTA_EXCEEDED",
              message: "Export is too large.",
              retryable: false
            }
          },
          409
        )
    });

    await expect(port.create(request)).resolves.toEqual({
      ok: false,
      error: {
        errorVersion: 1,
        code: "QUOTA_EXCEEDED",
        message: "Export is too large.",
        retryable: false
      }
    });
  });
});
