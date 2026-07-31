import { HttpEvidenceDownloadPort } from "@/adapters/httpEvidenceDownload";
import type { EvidenceDownloadDescriptor } from "@/data/evidenceDownload";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000601";
const EVIDENCE_ID = "00000000-0000-4000-8000-000000000602";
const VERSION_ID = "00000000-0000-4000-8000-000000000603";
const BLOB_ID = "00000000-0000-4000-8000-000000000604";
const CHECKSUM = "a".repeat(64);
const BYTES = new Uint8Array([65, 76, 89, 82]);
const OBJECT_KEY = `${HOUSEHOLD_ID}/${BLOB_ID}/${VERSION_ID}`;
const DOWNLOAD_URL =
  `https://project-ref.supabase.co/storage/v1/object/sign/evidence/${OBJECT_KEY}` +
  "?token=short-lived-download-token";

const descriptor: EvidenceDownloadDescriptor = {
  apiVersion: 1,
  householdId: HOUSEHOLD_ID,
  evidenceId: EVIDENCE_ID,
  evidenceVersionId: VERSION_ID,
  blobId: BLOB_ID,
  fileName: "ownership.pdf",
  mimeType: "application/pdf",
  byteSize: BYTES.byteLength,
  checksumSha256: CHECKSUM
};

function byteResponse(bytes = BYTES): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Length": String(bytes.byteLength),
      "Content-Type": "application/pdf"
    }
  });
}

function intentResponse(): Response {
  return new Response(
    JSON.stringify({
      downloadTarget: {
        provider: "supabase",
        objectKey: OBJECT_KEY,
        method: "GET",
        url: DOWNLOAD_URL,
        requiredHeaders: {},
        expiresAt: "2099-07-27T12:02:00.000Z"
      }
    }),
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json"
      }
    }
  );
}

describe("authenticated Evidence download adapter", () => {
  it("downloads with a fresh user bearer and returns only SHA-256 verified bytes", async () => {
    const getAccessToken = jest.fn(async () => "fresh-user-token");
    const fetchImpl = jest.fn(
      async (url: string, _init: RequestInit) =>
        String(url).endsWith("/evidence/download")
          ? intentResponse()
          : byteResponse()
    );
    const port = new HttpEvidenceDownloadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api/",
      getAccessToken,
      fetchImpl,
      digestBytes: async () => CHECKSUM
    });
    const controller = new AbortController();

    const result = await port.download(descriptor, {
      signal: controller.signal,
      deadlineAtMs: Date.now() + 1_000
    });

    expect(result).toEqual({ ok: true, value: BYTES });
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://project-ref.supabase.co/functions/v1/api/evidence/download"
    );
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer fresh-user-token"
    );
    expect(init.signal).toBe(controller.signal);
    expect(JSON.parse(String(init.body))).toEqual(descriptor);
    const [providerUrl, providerInit] = fetchImpl.mock.calls[1]!;
    expect(providerUrl).toBe(DOWNLOAD_URL);
    expect(providerInit.method).toBe("GET");
    expect(new Headers(providerInit.headers).get("Authorization")).toBeNull();
    expect(providerInit.signal).toBe(controller.signal);
  });

  it("rejects and wipes bytes when the cloud response checksum is tampered", async () => {
    const port = new HttpEvidenceDownloadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      getAccessToken: async () => "user-token",
      fetchImpl: async (url) =>
        String(url).endsWith("/evidence/download")
          ? intentResponse()
          : byteResponse(),
      digestBytes: async () => "b".repeat(64)
    });

    const result = await port.download(descriptor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "INVALID_FILE",
        retryable: false
      });
    }
  });

  it("does not issue a request when an authenticated bearer is missing", async () => {
    const fetchImpl = jest.fn();
    const port = new HttpEvidenceDownloadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      getAccessToken: async () => " ",
      fetchImpl,
      digestBytes: async () => CHECKSUM
    });

    await expect(port.download(descriptor)).resolves.toEqual({
      ok: false,
      error: {
        errorVersion: 1,
        code: "AUTHENTICATION_REQUIRED",
        message: "Sign in before downloading Evidence.",
        retryable: false
      }
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("marks an interrupted request retryable and succeeds on the next attempt", async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(intentResponse())
      .mockResolvedValueOnce(byteResponse());
    const port = new HttpEvidenceDownloadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      getAccessToken: async () => "user-token",
      fetchImpl,
      digestBytes: async () => CHECKSUM
    });

    const interrupted = await port.download(descriptor);
    const retried = await port.download(descriptor);

    expect(interrupted).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "OFFLINE",
        retryable: true
      })
    });
    expect(retried).toEqual({ ok: true, value: BYTES });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("preserves an authorization denial returned by the reviewed API", async () => {
    const port = new HttpEvidenceDownloadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      getAccessToken: async () => "revoked-user-token",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              errorVersion: 1,
              code: "AUTHORIZATION_DENIED",
              message: "Household access was revoked.",
              retryable: false
            }
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        ),
      digestBytes: async () => CHECKSUM
    });

    await expect(port.download(descriptor)).resolves.toEqual({
      ok: false,
      error: {
        errorVersion: 1,
        code: "AUTHORIZATION_DENIED",
        message: "Household access was revoked.",
        retryable: false
      }
    });
  });
});
