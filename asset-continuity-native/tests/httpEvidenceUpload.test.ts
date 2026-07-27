import { HttpEvidenceUploadPort } from "@/adapters/httpEvidenceUpload";
import type { MaterializedAttachment } from "@/data/attachmentStore";
import type { EvidenceUploadDescriptor } from "@/data/evidenceUpload";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000201";
const EVIDENCE_ID = "00000000-0000-4000-8000-000000000202";
const VERSION_ID = "00000000-0000-4000-8000-000000000203";
const BLOB_ID = "00000000-0000-4000-8000-000000000204";
const CHECKSUM = "c".repeat(64);

const descriptor: EvidenceUploadDescriptor = {
  apiVersion: 1,
  householdId: HOUSEHOLD_ID,
  evidenceId: EVIDENCE_ID,
  evidenceVersionId: VERSION_ID,
  blobId: BLOB_ID,
  fileName: "receipt.pdf",
  mimeType: "application/pdf",
  byteSize: 4,
  checksumSha256: CHECKSUM
};

const objectKey = `${HOUSEHOLD_ID}/${BLOB_ID}/${VERSION_ID}`;
const intent = {
  uploadId: BLOB_ID,
  blobObjectId: BLOB_ID,
  expiresAt: "2026-07-27T12:02:00.000Z",
  uploadTarget: {
    provider: "supabase-storage",
    bucket: "evidence",
    objectKey,
    path: objectKey,
    token: "short-lived-signed-upload-token"
  }
} as const;

const attachment: MaterializedAttachment = {
  uri: "file:///cache/alyr-view-receipt.pdf",
  fileName: "receipt.pdf",
  mimeType: "application/pdf",
  byteSize: 4,
  checksumSha256: CHECKSUM,
  integrity: "aes-gcm-and-sha256",
  temporary: true
};

describe("user-authenticated Supabase Evidence upload adapter", () => {
  it("uses fresh user bearers for API calls and omits them from the signed byte transfer", async () => {
    const tokens = jest
      .fn()
      .mockResolvedValueOnce("user-token-one")
      .mockResolvedValueOnce("user-token-two");
    const sourceBytes = new Uint8Array([1, 2, 3, 4]);
    const requests: Array<{
      readonly url: string;
      readonly headers: Headers;
      readonly body: Uint8Array | null;
    }> = [];
    const fetchImpl = jest.fn(
      async (url: string, init: RequestInit): Promise<Response> => {
        const body =
          init.body instanceof ArrayBuffer
            ? new Uint8Array(init.body).slice()
            : null;
        requests.push({
          url,
          headers: new Headers(init.headers),
          body
        });
        if (url.endsWith("/uploads/intents")) {
          return new Response(JSON.stringify(intent), { status: 201 });
        }
        if (url.includes("/object/upload/sign/")) {
          return new Response(JSON.stringify({ Key: "evidence/proof" }), {
            status: 200
          });
        }
        return new Response(
          JSON.stringify({
            upload: {
              id: BLOB_ID,
              objectKey,
              status: "stored"
            },
            note: "Verified."
          }),
          { status: 200 }
        );
      }
    );
    const port = new HttpEvidenceUploadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      projectUrl: "https://project-ref.supabase.co",
      getAccessToken: tokens,
      fetchImpl,
      readBytes: async () => sourceBytes,
      digestBytes: async () => CHECKSUM
    });

    const prepared = await port.createIntent(descriptor);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const uploaded = await port.upload(
      descriptor,
      prepared.value,
      attachment
    );
    const completed = await port.complete(descriptor, BLOB_ID);

    expect(uploaded).toEqual({
      ok: true,
      value: { outcome: "uploaded" }
    });
    expect(completed.ok).toBe(true);
    expect(tokens).toHaveBeenCalledTimes(2);
    expect(requests[0]?.headers.get("Authorization")).toBe(
      "Bearer user-token-one"
    );
    expect(requests[1]?.headers.get("Authorization")).toBeNull();
    expect(requests[1]?.headers.get("x-upsert")).toBe("false");
    expect(requests[1]?.body).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(requests[2]?.headers.get("Authorization")).toBe(
      "Bearer user-token-two"
    );
    expect([...sourceBytes]).toEqual([0, 0, 0, 0]);
  });

  it.each([
    ["size", new Uint8Array([1, 2, 3])],
    ["checksum", new Uint8Array([1, 2, 3, 4])]
  ] as const)(
    "rejects a materialized %s mismatch before network transfer",
    async (kind, bytes) => {
      const fetchImpl = jest.fn();
      const port = new HttpEvidenceUploadPort({
        apiBaseUrl:
          "https://project-ref.supabase.co/functions/v1/api",
        projectUrl: "https://project-ref.supabase.co",
        getAccessToken: async () => "user-token",
        fetchImpl,
        readBytes: async () => bytes,
        digestBytes: async () =>
          kind === "checksum" ? "d".repeat(64) : CHECKSUM
      });

      const result = await port.upload(
        descriptor,
        intent,
        attachment
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_FILE");
      expect(fetchImpl).not.toHaveBeenCalled();
      expect([...bytes]).toEqual(new Array(bytes.length).fill(0));
    }
  );

  it("treats an immutable-object conflict as verification-required, not stored", async () => {
    const fetchImpl = jest.fn(async () => new Response("", { status: 409 }));
    const port = new HttpEvidenceUploadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      projectUrl: "https://project-ref.supabase.co",
      getAccessToken: async () => "user-token",
      fetchImpl,
      readBytes: async () => new Uint8Array([1, 2, 3, 4]),
      digestBytes: async () => CHECKSUM
    });

    await expect(
      port.upload(descriptor, intent, attachment)
    ).resolves.toEqual({
      ok: true,
      value: { outcome: "already-present" }
    });
  });
});
