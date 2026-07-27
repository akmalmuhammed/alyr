/**
 * Minimal async key/value boundary implemented by Expo SecureStore in signed
 * builds. It deliberately matches the storage contract consumed by
 * supabase-js without depending on browser Storage or AsyncStorage.
 */
export interface SecureSessionStoreDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SupabaseSessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ChunkedSecureSessionStorageOptions {
  readonly driver: SecureSessionStoreDriver;
  readonly digest: (value: string) => Promise<string>;
  readonly createGeneration: () => string;
  /**
   * SecureStore has no Expo-enforced value limit, but some iOS releases have
   * rejected values around 2 KB. Chunks remain below that historical boundary.
   */
  readonly chunkByteLimit?: number;
}

interface GenerationDescriptor {
  readonly generation: string;
  readonly chunkCount: number;
}

interface CurrentGeneration extends GenerationDescriptor {
  readonly characterLength: number;
  readonly digest: string;
}

interface StorageManifest {
  readonly version: 1;
  readonly current: CurrentGeneration;
  readonly retired: readonly GenerationDescriptor[];
}

const STORAGE_PREFIX = "alyr.auth.v1";
const DEFAULT_CHUNK_BYTE_LIMIT = 1_400;
const MINIMUM_CHUNK_BYTE_LIMIT = 256;
const MAXIMUM_CHUNK_BYTE_LIMIT = 1_800;
const MAXIMUM_CHUNKS = 256;
const MAXIMUM_RETIRED_GENERATIONS = 16;
const SHA_256_HEX = /^[a-f0-9]{64}$/u;
const GENERATION_ID = /^[a-f0-9]{32}$/u;

function storageFailure(): Error {
  return new Error("Secure account session storage is unavailable or corrupt.");
}

function utf8ByteLength(character: string): number {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function splitIntoUtf8Chunks(
  value: string,
  byteLimit: number
): readonly string[] {
  if (value.length === 0) return [""];

  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (chunk && chunkBytes + characterBytes > byteLimit) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }
  chunks.push(chunk);
  return chunks;
}

function normalizeGeneration(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll("-", "");
  if (!GENERATION_ID.test(normalized)) throw storageFailure();
  return normalized;
}

function isGenerationDescriptor(
  value: unknown
): value is GenerationDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.generation === "string" &&
    GENERATION_ID.test(candidate.generation) &&
    typeof candidate.chunkCount === "number" &&
    Number.isSafeInteger(candidate.chunkCount) &&
    candidate.chunkCount >= 1 &&
    candidate.chunkCount <= MAXIMUM_CHUNKS
  );
}

function isCurrentGeneration(value: unknown): value is CurrentGeneration {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isGenerationDescriptor(value)) return false;
  return (
    typeof candidate.characterLength === "number" &&
    Number.isSafeInteger(candidate.characterLength) &&
    candidate.characterLength >= 0 &&
    typeof candidate.digest === "string" &&
    SHA_256_HEX.test(candidate.digest)
  );
}

function parseManifest(value: string): StorageManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw storageFailure();
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw storageFailure();
  }
  const candidate = parsed as Record<string, unknown>;
  const current = candidate.current;
  const retired = candidate.retired;
  if (
    candidate.version !== 1 ||
    !isCurrentGeneration(current) ||
    !Array.isArray(retired) ||
    retired.length > MAXIMUM_RETIRED_GENERATIONS ||
    !retired.every(isGenerationDescriptor)
  ) {
    throw storageFailure();
  }
  return {
    version: 1,
    current: {
      generation: current.generation,
      chunkCount: current.chunkCount,
      characterLength: current.characterLength,
      digest: current.digest
    },
    retired
  };
}

function manifestKey(namespace: string): string {
  return `${STORAGE_PREFIX}.${namespace}.manifest`;
}

function chunkKey(
  namespace: string,
  generation: string,
  index: number
): string {
  return `${STORAGE_PREFIX}.${namespace}.${generation}.${index}`;
}

async function verifiedDigest(
  digest: (value: string) => Promise<string>,
  value: string
): Promise<string> {
  const result = (await digest(value)).trim().toLowerCase();
  if (!SHA_256_HEX.test(result)) throw storageFailure();
  return result;
}

async function removeGenerations(
  driver: SecureSessionStoreDriver,
  namespace: string,
  generations: readonly GenerationDescriptor[]
): Promise<readonly GenerationDescriptor[]> {
  const failed: GenerationDescriptor[] = [];
  for (const descriptor of generations) {
    let generationFailed = false;
    for (let index = 0; index < descriptor.chunkCount; index += 1) {
      try {
        await driver.removeItem(
          chunkKey(namespace, descriptor.generation, index)
        );
      } catch {
        generationFailed = true;
      }
    }
    if (generationFailed) failed.push(descriptor);
  }
  return failed;
}

/**
 * Stores one Supabase session across small encrypted SecureStore records.
 *
 * A manifest is switched only after every new chunk is durable. Old
 * generations remain listed until their encrypted chunks are deleted, so
 * interrupted rotation never makes a previous bearer current again.
 */
export function createChunkedSecureSessionStorage({
  driver,
  digest,
  createGeneration,
  chunkByteLimit = DEFAULT_CHUNK_BYTE_LIMIT
}: ChunkedSecureSessionStorageOptions): SupabaseSessionStorage {
  if (
    !Number.isSafeInteger(chunkByteLimit) ||
    chunkByteLimit < MINIMUM_CHUNK_BYTE_LIMIT ||
    chunkByteLimit > MAXIMUM_CHUNK_BYTE_LIMIT
  ) {
    throw new Error("Secure session chunk size is outside the allowed range.");
  }

  async function namespaceFor(logicalKey: string): Promise<string> {
    if (!logicalKey) throw storageFailure();
    return verifiedDigest(digest, logicalKey);
  }

  async function readManifest(
    namespace: string
  ): Promise<StorageManifest | null> {
    const raw = await driver.getItem(manifestKey(namespace));
    return raw === null ? null : parseManifest(raw);
  }

  async function compactRetired(
    namespace: string,
    manifest: StorageManifest
  ): Promise<StorageManifest> {
    if (manifest.retired.length === 0) return manifest;
    const failed = await removeGenerations(
      driver,
      namespace,
      manifest.retired
    );
    if (failed.length === manifest.retired.length) return manifest;
    const compacted: StorageManifest = {
      ...manifest,
      retired: failed
    };
    try {
      await driver.setItem(
        manifestKey(namespace),
        JSON.stringify(compacted)
      );
      return compacted;
    } catch {
      // The original manifest still points at the valid current generation.
      return manifest;
    }
  }

  return {
    async getItem(logicalKey) {
      const namespace = await namespaceFor(logicalKey);
      const manifest = await readManifest(namespace);
      if (manifest === null) return null;

      const chunks: string[] = [];
      for (let index = 0; index < manifest.current.chunkCount; index += 1) {
        const chunk = await driver.getItem(
          chunkKey(namespace, manifest.current.generation, index)
        );
        if (chunk === null) throw storageFailure();
        chunks.push(chunk);
      }
      const value = chunks.join("");
      if (
        value.length !== manifest.current.characterLength ||
        (await verifiedDigest(digest, value)) !== manifest.current.digest
      ) {
        throw storageFailure();
      }
      await compactRetired(namespace, manifest);
      return value;
    },

    async setItem(logicalKey, value) {
      const namespace = await namespaceFor(logicalKey);
      const previous = await readManifest(namespace);
      const compactedPrevious =
        previous === null
          ? null
          : await compactRetired(namespace, previous);
      const generation = normalizeGeneration(createGeneration());
      if (
        compactedPrevious &&
        [
          compactedPrevious.current,
          ...compactedPrevious.retired
        ].some((entry) => entry.generation === generation)
      ) {
        throw storageFailure();
      }
      const chunks = splitIntoUtf8Chunks(value, chunkByteLimit);
      if (chunks.length > MAXIMUM_CHUNKS) throw storageFailure();

      const written: GenerationDescriptor = {
        generation,
        chunkCount: chunks.length
      };
      let writtenCount = 0;
      try {
        for (let index = 0; index < chunks.length; index += 1) {
          const chunk = chunks[index];
          if (chunk === undefined) throw storageFailure();
          await driver.setItem(
            chunkKey(namespace, generation, index),
            chunk
          );
          writtenCount += 1;
        }

        const retired =
          compactedPrevious === null
            ? []
            : [
                ...compactedPrevious.retired,
                {
                  generation: compactedPrevious.current.generation,
                  chunkCount: compactedPrevious.current.chunkCount
                }
              ];
        if (retired.length > MAXIMUM_RETIRED_GENERATIONS) {
          throw storageFailure();
        }
        const next: StorageManifest = {
          version: 1,
          current: {
            ...written,
            characterLength: value.length,
            digest: await verifiedDigest(digest, value)
          },
          retired
        };
        await driver.setItem(manifestKey(namespace), JSON.stringify(next));
        await compactRetired(namespace, next);
      } catch (error) {
        for (let index = 0; index < writtenCount; index += 1) {
          try {
            await driver.removeItem(chunkKey(namespace, generation, index));
          } catch {
            // The generation was never referenced by the manifest.
          }
        }
        throw error;
      }
    },

    async removeItem(logicalKey) {
      const namespace = await namespaceFor(logicalKey);
      const manifest = await readManifest(namespace);
      if (manifest === null) return;

      // Removing the pointer first prevents a partially deleted bearer from
      // ever becoming current again after an interrupted sign-out.
      await driver.removeItem(manifestKey(namespace));
      await removeGenerations(driver, namespace, [
        manifest.current,
        ...manifest.retired
      ]);
    }
  };
}
