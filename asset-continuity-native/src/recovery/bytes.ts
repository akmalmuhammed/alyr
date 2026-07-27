import { RecoveryKitError } from "./types";

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const FORBIDDEN_JSON_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype"
]);
const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 100_000;

export function concatBytes(
  chunks: readonly Uint8Array[],
  expectedLength?: number
): Uint8Array {
  const length =
    expectedLength ??
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset + chunk.byteLength > output.byteLength) {
      throw new RecoveryKitError(
        "LIMIT_EXCEEDED",
        "Recovery Kit byte accounting exceeded its declared limit."
      );
    }
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== output.byteLength) {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Recovery Kit byte accounting did not match the container."
    );
  }
  return output;
}

export function writeUint16(value: number): Uint8Array {
  const output = new Uint8Array(2);
  const view = new DataView(output.buffer);
  view.setUint16(0, value, false);
  return output;
}

export function writeUint32(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RecoveryKitError(
      "LIMIT_EXCEEDED",
      "Recovery Kit length is outside the supported range."
    );
  }
  const output = new Uint8Array(4);
  const view = new DataView(output.buffer);
  view.setUint32(0, value, false);
  return output;
}

export function readUint16(value: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > value.byteLength) {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Recovery Kit contains a truncated integer."
    );
  }
  return new DataView(
    value.buffer,
    value.byteOffset + offset,
    2
  ).getUint16(0, false);
}

export function readUint32(value: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > value.byteLength) {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Recovery Kit contains a truncated length."
    );
  }
  return new DataView(
    value.buffer,
    value.byteOffset + offset,
    4
  ).getUint32(0, false);
}

export function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      const trail = value.charCodeAt(index + 1);
      if (trail < 0xdc00 || trail > 0xdfff) {
        throw new RecoveryKitError(
          "INVALID_INPUT",
          "Text contains an invalid Unicode surrogate."
        );
      }
      codePoint =
        0x1_0000 + ((codePoint - 0xd800) << 10) + (trail - 0xdc00);
      index += 1;
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      throw new RecoveryKitError(
        "INVALID_INPUT",
        "Text contains an invalid Unicode surrogate."
      );
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >>> 12),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >>> 18),
        0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return Uint8Array.from(bytes);
}

export function decodeUtf8Strict(value: Uint8Array): string {
  let output = "";
  for (let index = 0; index < value.byteLength; ) {
    const first = value[index]!;
    let codePoint: number;
    let length: number;
    let minimum: number;
    if (first <= 0x7f) {
      codePoint = first;
      length = 1;
      minimum = 0;
    } else if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f;
      length = 2;
      minimum = 0x80;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f;
      length = 3;
      minimum = 0x800;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07;
      length = 4;
      minimum = 0x1_0000;
    } else {
      throw new RecoveryKitError(
        "CORRUPT_CONTAINER",
        "Recovery Kit contains invalid UTF-8."
      );
    }

    if (index + length > value.byteLength) {
      throw new RecoveryKitError(
        "CORRUPT_CONTAINER",
        "Recovery Kit contains truncated UTF-8."
      );
    }
    for (let continuation = 1; continuation < length; continuation += 1) {
      const byte = value[index + continuation]!;
      if ((byte & 0xc0) !== 0x80) {
        throw new RecoveryKitError(
          "CORRUPT_CONTAINER",
          "Recovery Kit contains invalid UTF-8 continuation bytes."
        );
      }
      codePoint = (codePoint << 6) | (byte & 0x3f);
    }
    if (
      codePoint < minimum ||
      codePoint > 0x10_ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      throw new RecoveryKitError(
        "CORRUPT_CONTAINER",
        "Recovery Kit contains a non-canonical Unicode sequence."
      );
    }
    output +=
      codePoint <= 0xffff
        ? String.fromCharCode(codePoint)
        : String.fromCodePoint(codePoint);
    index += length;
  }
  return output;
}

export function bytesToBase64(value: Uint8Array): string {
  let output = "";
  for (let index = 0; index < value.byteLength; index += 3) {
    const first = value[index]!;
    const second = value[index + 1];
    const third = value[index + 2];
    const combined =
      (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += BASE64_ALPHABET[(combined >>> 18) & 0x3f];
    output += BASE64_ALPHABET[(combined >>> 12) & 0x3f];
    output +=
      second === undefined
        ? "="
        : BASE64_ALPHABET[(combined >>> 6) & 0x3f];
    output +=
      third === undefined ? "=" : BASE64_ALPHABET[combined & 0x3f];
  }
  return output;
}

export function base64ToBytes(value: string): Uint8Array {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(value) ||
    /=[^=]/u.test(value)
  ) {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Recovery Kit contains invalid base64."
    );
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((value.length / 4) * 3 - padding);
  let outputOffset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const values = [0, 1, 2, 3].map((relative) => {
      const character = value[index + relative]!;
      return character === "=" ? 0 : BASE64_ALPHABET.indexOf(character);
    });
    if (values.some((item) => item < 0)) {
      throw new RecoveryKitError(
        "CORRUPT_CONTAINER",
        "Recovery Kit contains invalid base64 characters."
      );
    }
    const combined =
      (values[0]! << 18) |
      (values[1]! << 12) |
      (values[2]! << 6) |
      values[3]!;
    if (outputOffset < output.length) {
      output[outputOffset++] = (combined >>> 16) & 0xff;
    }
    if (outputOffset < output.length) {
      output[outputOffset++] = (combined >>> 8) & 0xff;
    }
    if (outputOffset < output.length) {
      output[outputOffset++] = combined & 0xff;
    }
  }
  if (bytesToBase64(output) !== value) {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Recovery Kit contains non-canonical base64."
    );
  }
  return output;
}

export function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function timingSafeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function canonicalStringify(value: unknown): string {
  const seen = new Set<object>();
  const state = { nodes: 0 };

  function serialize(current: unknown, depth: number): string {
    state.nodes += 1;
    if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
      throw new RecoveryKitError(
        "LIMIT_EXCEEDED",
        "Recovery Kit JSON exceeds structural limits."
      );
    }
    if (current === null) {
      return "null";
    }
    if (typeof current === "string") {
      return JSON.stringify(current);
    }
    if (typeof current === "boolean") {
      return current ? "true" : "false";
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new RecoveryKitError(
          "INVALID_INPUT",
          "Recovery Kit JSON contains a non-finite number."
        );
      }
      return JSON.stringify(current);
    }
    if (typeof current !== "object") {
      throw new RecoveryKitError(
        "INVALID_INPUT",
        "Recovery Kit JSON contains an unsupported value."
      );
    }
    if (seen.has(current)) {
      throw new RecoveryKitError(
        "INVALID_INPUT",
        "Recovery Kit JSON contains a cycle."
      );
    }
    seen.add(current);
    try {
      if (Array.isArray(current)) {
        for (let index = 0; index < current.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(current, index)) {
            throw new RecoveryKitError(
              "INVALID_INPUT",
              "Recovery Kit JSON contains a sparse array."
            );
          }
        }
        return `[${current
          .map((item) => serialize(item, depth + 1))
          .join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(current) as object | null;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new RecoveryKitError(
          "INVALID_INPUT",
          "Recovery Kit JSON must contain only plain objects."
        );
      }
      const record = current as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      for (const key of keys) {
        if (FORBIDDEN_JSON_KEYS.has(key)) {
          throw new RecoveryKitError(
            "INVALID_INPUT",
            "Recovery Kit JSON contains a reserved object key."
          );
        }
      }
      return `{${keys
        .map(
          (key) =>
            `${JSON.stringify(key)}:${serialize(record[key], depth + 1)}`
        )
        .join(",")}}`;
    } finally {
      seen.delete(current);
    }
  }

  return serialize(value, 0);
}

export function parseCanonicalJson(value: Uint8Array): unknown {
  const text = decodeUtf8Strict(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Recovery Kit contains malformed JSON."
    );
  }
  let canonical: string;
  try {
    canonical = canonicalStringify(parsed);
  } catch {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Recovery Kit JSON does not satisfy structural limits."
    );
  }
  if (canonical !== text) {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Recovery Kit JSON is not in canonical form."
    );
  }
  return parsed;
}

export function isPlainRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}
