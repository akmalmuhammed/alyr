export const defaultMaximumJsonBytes = 1_048_576;

const jsonContentType = "application/json";

function bodyError(code: string): Error {
  return new Error(code);
}

function declaredBodyLength(request: Request, maximumBytes: number): number | null {
  const value = request.headers.get("Content-Length");
  if (value === null) return null;
  const normalized = value.trim();
  if (!/^(?:0|[1-9][0-9]*)$/u.test(normalized)) {
    throw bodyError("CONTENT_LENGTH_INVALID");
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw bodyError("CONTENT_LENGTH_INVALID");
  }
  if (parsed > maximumBytes) throw bodyError("REQUEST_TOO_LARGE");
  return parsed;
}

function assertJsonTransport(request: Request): void {
  const contentType = (request.headers.get("Content-Type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== jsonContentType) {
    throw bodyError("CONTENT_TYPE_REQUIRED");
  }

  const contentEncoding = (request.headers.get("Content-Encoding") ?? "identity")
    .trim()
    .toLowerCase();
  if (contentEncoding !== "" && contentEncoding !== "identity") {
    // Keep the byte ceiling meaningful. Compressed API bodies would otherwise
    // permit a small declared payload to inflate inside the Edge worker.
    throw bodyError("CONTENT_ENCODING_UNSUPPORTED");
  }
}

async function readBodyBytes(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (request.body === null) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  const reader = request.body.getReader();
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      if (!(chunk instanceof Uint8Array)) {
        await reader.cancel("Heldat accepts byte request bodies only.")
          .catch(() => undefined);
        throw bodyError("INVALID_JSON");
      }
      if (totalBytes + chunk.byteLength > maximumBytes) {
        chunk.fill(0);
        await reader.cancel("Heldat request body exceeded its byte limit.")
          .catch(() => undefined);
        throw bodyError("REQUEST_TOO_LARGE");
      }
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }
  } catch (error) {
    for (const chunk of chunks) chunk.fill(0);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
    chunk.fill(0);
  }
  return bytes;
}

/** Read one JSON object without ever buffering more than `maximumBytes`. */
export async function readBoundedJsonObject(
  request: Request,
  maximumBytes = defaultMaximumJsonBytes,
): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new TypeError("maximumBytes must be a positive safe integer.");
  }
  assertJsonTransport(request);
  const declaredLength = declaredBodyLength(request, maximumBytes);
  const bytes = await readBodyBytes(request, maximumBytes);
  try {
    if (declaredLength !== null && declaredLength !== bytes.byteLength) {
      throw bodyError("CONTENT_LENGTH_INVALID");
    }

    let raw: string;
    try {
      raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw bodyError("INVALID_JSON");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw bodyError("INVALID_JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw bodyError("INVALID_JSON");
    }
    return parsed as Record<string, unknown>;
  } finally {
    bytes.fill(0);
  }
}
