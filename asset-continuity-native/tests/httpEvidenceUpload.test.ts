import { HttpEvidenceUploadPort } from "@/adapters/httpEvidenceUpload";
import type { MaterializedAttachment } from "@/data/attachmentStore";
import type { EvidenceUploadDescriptor } from "@/data/evidenceUpload";
import {
  runSyncProviderBoundary,
  type SyncExecutionControl
} from "@/data/syncExecution";
import {
  createVaultGenerationScope,
  type VaultGenerationScope
} from "@/data/vaultOperationGate";

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
  expiresAt: "2099-07-27T12:02:00.000Z",
  uploadTarget: {
    provider: "supabase",
    objectKey,
    method: "PUT",
    url:
      `https://project-ref.supabase.co/storage/v1/object/upload/sign/evidence/${objectKey}` +
      "?token=short-lived-signed-upload-token",
    requiredHeaders: {
      "cache-control": "max-age=3600",
      "content-type": "application/pdf",
      "x-upsert": "false"
    },
    expiresAt: "2099-07-27T12:02:00.000Z"
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function generationExecution(
  generation: VaultGenerationScope
): SyncExecutionControl {
  return {
    signal: generation.signal,
    providerTimeoutMs: 5_000,
    trackProviderSettlement: (providerPromise) =>
      generation.track(() => providerPromise)
  };
}

async function uploadThenComplete(
  port: HttpEvidenceUploadPort,
  execution: SyncExecutionControl
): Promise<void> {
  const uploaded = await runSyncProviderBoundary(
    execution,
    (context) => port.upload(descriptor, intent, attachment, context)
  );
  if (!uploaded.ok) {
    throw new Error("The upload fixture did not reach completion.");
  }
  const completed = await runSyncProviderBoundary(
    execution,
    (context) => port.complete(descriptor, BLOB_ID, context)
  );
  if (!completed.ok) {
    throw new Error("The completion fixture did not verify the upload.");
  }
}

async function expectStillPending(promise: Promise<unknown>): Promise<void> {
  const state = { settled: false };
  void promise.then(
    () => {
      state.settled = true;
    },
    () => {
      state.settled = true;
    }
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(state.settled).toBe(false);
}

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
      readonly signal: AbortSignal | null;
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
          body,
          signal: init.signal ?? null
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
    const controller = new AbortController();
    const context = {
      signal: controller.signal,
      deadlineAtMs: Date.now() + 1_000
    } as const;

    const prepared = await port.createIntent(descriptor, context);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const uploaded = await port.upload(
      descriptor,
      prepared.value,
      attachment,
      context
    );
    const completed = await port.complete(
      descriptor,
      BLOB_ID,
      context
    );

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
    expect(requests.every((request) => request.signal === controller.signal)).toBe(
      true
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

  it("holds the vault transition through an aborted file read and zeroizes late bytes before settling", async () => {
    const generation = createVaultGenerationScope();
    const readStarted = deferred<void>();
    const readResult = deferred<Uint8Array>();
    const digestBytes = jest.fn(async () => CHECKSUM);
    const fetchImpl = jest.fn();
    const sourceBytes = new Uint8Array([1, 2, 3, 4]);
    const port = new HttpEvidenceUploadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      projectUrl: "https://project-ref.supabase.co",
      getAccessToken: async () => "user-token",
      fetchImpl,
      readBytes: async () => {
        readStarted.resolve();
        return readResult.promise;
      },
      digestBytes
    });
    const flow = uploadThenComplete(
      port,
      generationExecution(generation)
    );
    const rejection = expect(flow).rejects.toMatchObject({
      name: "SyncExecutionCancelledError",
      reason: "cancelled"
    });
    await readStarted.promise;

    generation.cancel();
    await rejection;
    const transition = generation.whenIdle();
    await expectStillPending(transition);
    expect([...sourceBytes]).toEqual([1, 2, 3, 4]);

    readResult.resolve(sourceBytes);
    await transition;

    expect([...sourceBytes]).toEqual([0, 0, 0, 0]);
    expect(digestBytes).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("holds the vault transition through an aborted digest and never starts PUT or completion", async () => {
    const generation = createVaultGenerationScope();
    const digestStarted = deferred<void>();
    const digestResult = deferred<string>();
    const fetchImpl = jest.fn();
    const sourceBytes = new Uint8Array([1, 2, 3, 4]);
    const port = new HttpEvidenceUploadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      projectUrl: "https://project-ref.supabase.co",
      getAccessToken: async () => "user-token",
      fetchImpl,
      readBytes: async () => sourceBytes,
      digestBytes: async () => {
        digestStarted.resolve();
        return digestResult.promise;
      }
    });
    const flow = uploadThenComplete(
      port,
      generationExecution(generation)
    );
    const rejection = expect(flow).rejects.toMatchObject({
      name: "SyncExecutionCancelledError",
      reason: "cancelled"
    });
    await digestStarted.promise;

    generation.cancel();
    await rejection;
    const transition = generation.whenIdle();
    await expectStillPending(transition);
    expect([...sourceBytes]).toEqual([1, 2, 3, 4]);

    digestResult.resolve(CHECKSUM);
    await transition;

    expect([...sourceBytes]).toEqual([0, 0, 0, 0]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("holds the vault transition through an aborted PUT, zeroizes both byte copies, and never calls completion", async () => {
    const generation = createVaultGenerationScope();
    const putStarted = deferred<void>();
    const putAbortObserved = deferred<void>();
    const releasePutSettlement = deferred<void>();
    const sourceBytes = new Uint8Array([1, 2, 3, 4]);
    const transferState: { bytes?: Uint8Array } = {};
    const requestedUrls: string[] = [];
    const fetchImpl = jest.fn(
      (url: string, init: RequestInit): Promise<Response> => {
        requestedUrls.push(url);
        transferState.bytes = new Uint8Array(
          init.body as ArrayBuffer
        );
        putStarted.resolve();
        return new Promise<Response>((_resolve, reject) => {
          const abort = () => {
            putAbortObserved.resolve();
            void releasePutSettlement.promise.then(() => {
              reject(new Error("PUT aborted"));
            });
          };
          if (init.signal?.aborted) {
            abort();
          } else {
            init.signal?.addEventListener("abort", abort, {
              once: true
            });
          }
        });
      }
    );
    const port = new HttpEvidenceUploadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      projectUrl: "https://project-ref.supabase.co",
      getAccessToken: async () => "user-token",
      fetchImpl,
      readBytes: async () => sourceBytes,
      digestBytes: async () => CHECKSUM
    });
    const flow = uploadThenComplete(
      port,
      generationExecution(generation)
    );
    const rejection = expect(flow).rejects.toMatchObject({
      name: "SyncExecutionCancelledError",
      reason: "cancelled"
    });
    await putStarted.promise;

    generation.cancel();
    await rejection;
    await putAbortObserved.promise;
    const transition = generation.whenIdle();
    await expectStillPending(transition);
    expect([...sourceBytes]).toEqual([1, 2, 3, 4]);
    expect([...(transferState.bytes ?? [])]).toEqual([1, 2, 3, 4]);
    expect(
      requestedUrls.some((url) => url.includes("/complete"))
    ).toBe(false);

    releasePutSettlement.resolve();
    await transition;

    expect([...sourceBytes]).toEqual([0, 0, 0, 0]);
    expect([...(transferState.bytes ?? [])]).toEqual([0, 0, 0, 0]);
    expect(
      requestedUrls.some((url) => url.includes("/complete"))
    ).toBe(false);
  });

  it("holds the vault transition until an aborted completion request settles and issues no later request", async () => {
    const generation = createVaultGenerationScope();
    const completeStarted = deferred<void>();
    const completeAbortObserved = deferred<void>();
    const releaseCompleteSettlement = deferred<void>();
    const sourceBytes = new Uint8Array([1, 2, 3, 4]);
    const transferState: { bytes?: Uint8Array } = {};
    const requestedUrls: string[] = [];
    const fetchImpl = jest.fn(
      (url: string, init: RequestInit): Promise<Response> => {
        requestedUrls.push(url);
        if (url.includes("/object/upload/sign/")) {
          transferState.bytes = new Uint8Array(
            init.body as ArrayBuffer
          );
          return Promise.resolve(new Response("", { status: 200 }));
        }
        completeStarted.resolve();
        return new Promise<Response>((_resolve, reject) => {
          const abort = () => {
            completeAbortObserved.resolve();
            void releaseCompleteSettlement.promise.then(() => {
              reject(new Error("completion aborted"));
            });
          };
          if (init.signal?.aborted) {
            abort();
          } else {
            init.signal?.addEventListener("abort", abort, {
              once: true
            });
          }
        });
      }
    );
    const port = new HttpEvidenceUploadPort({
      apiBaseUrl:
        "https://project-ref.supabase.co/functions/v1/api",
      projectUrl: "https://project-ref.supabase.co",
      getAccessToken: async () => "user-token",
      fetchImpl,
      readBytes: async () => sourceBytes,
      digestBytes: async () => CHECKSUM
    });
    const flow = uploadThenComplete(
      port,
      generationExecution(generation)
    );
    const rejection = expect(flow).rejects.toMatchObject({
      name: "SyncExecutionCancelledError",
      reason: "cancelled"
    });
    await completeStarted.promise;
    expect([...sourceBytes]).toEqual([0, 0, 0, 0]);
    expect([...(transferState.bytes ?? [])]).toEqual([0, 0, 0, 0]);

    generation.cancel();
    await rejection;
    await completeAbortObserved.promise;
    const transition = generation.whenIdle();
    await expectStillPending(transition);
    const requestCountAtCancel = requestedUrls.length;

    releaseCompleteSettlement.resolve();
    await transition;
    await Promise.resolve();

    expect(requestedUrls).toHaveLength(requestCountAtCancel);
    expect(
      requestedUrls.filter((url) => url.includes("/complete"))
    ).toHaveLength(1);
  });
});
