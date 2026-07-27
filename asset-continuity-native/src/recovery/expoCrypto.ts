import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  CryptoDigestAlgorithm,
  digest,
  getRandomBytesAsync
} from "expo-crypto";
import { argon2idAsync } from "@noble/hashes/argon2.js";

import type {
  RecoveryCryptoPort,
  RecoveryKdfParameters
} from "./types";
import { RecoveryKitError } from "./types";

/**
 * Adapter boundary for an audited native Argon2id module. Expo Crypto SDK 57
 * has no password KDF, so this dependency is intentionally required before
 * Recovery Kit export/import can be enabled in a signed build.
 */
export interface RecoveryArgon2idPort {
  derive(
    passphraseUtf8: Uint8Array,
    parameters: RecoveryKdfParameters
  ): Promise<Uint8Array>;
}

export type RecoveryArgon2idDeriver = (
  password: Uint8Array,
  salt: Uint8Array,
  options: {
    readonly version: 0x13;
    readonly t: number;
    readonly m: number;
    readonly p: number;
    readonly dkLen: 32;
    readonly maxmem: number;
    readonly asyncTick: number;
  }
) => Promise<Uint8Array>;

/**
 * Reviewable Argon2id adapter backed by `@noble/hashes`.
 *
 * The dependency is independently audited, has no transitive dependencies,
 * implements RFC 9106 Argon2id, wipes its 64 MiB working matrix after
 * derivation, and yields to the React Native event loop during long runs.
 * ALYR still instantiates this adapter only in the installed native runtime;
 * Expo Go and web previews remain explicitly unavailable.
 */
export class NobleRecoveryArgon2id implements RecoveryArgon2idPort {
  constructor(
    private readonly deriveArgon2id: RecoveryArgon2idDeriver =
      argon2idAsync
  ) {}

  async derive(
    passphraseUtf8: Uint8Array,
    parameters: RecoveryKdfParameters
  ): Promise<Uint8Array> {
    if (
      parameters.algorithm !== "argon2id" ||
      parameters.keyBytes !== 32 ||
      parameters.salt.byteLength !== 16 ||
      parameters.memoryKiB < 65_536 ||
      parameters.memoryKiB > 262_144 ||
      parameters.iterations < 3 ||
      parameters.iterations > 10 ||
      parameters.parallelism < 1 ||
      parameters.parallelism > 4
    ) {
      throw new RecoveryKitError(
        "CRYPTO_UNAVAILABLE",
        "Recovery Kit Argon2id parameters are outside the reviewed bounds."
      );
    }

    const password = passphraseUtf8.slice();
    const salt = parameters.salt.slice();
    try {
      return await this.deriveArgon2id(password, salt, {
        version: 0x13,
        t: parameters.iterations,
        m: parameters.memoryKiB,
        p: parameters.parallelism,
        dkLen: parameters.keyBytes,
        // Match the authenticated header exactly and prevent an implementation
        // change from allocating beyond the reviewed container request.
        maxmem: parameters.memoryKiB * 1024,
        // Bound individual JS work slices so progress indicators, VoiceOver,
        // and the iOS watchdog continue to receive event-loop time.
        asyncTick: 12
      });
    } finally {
      password.fill(0);
      salt.fill(0);
    }
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

/**
 * Uses Expo's native SHA-256, CSPRNG, and AES-256-GCM implementations. It has no
 * password-hash fallback: without `RecoveryArgon2idPort`, `deriveKey` fails
 * closed with `CRYPTO_UNAVAILABLE`.
 */
export class ExpoRecoveryCrypto implements RecoveryCryptoPort {
  constructor(private readonly argon2id: RecoveryArgon2idPort | null = null) {}

  async randomBytes(length: number): Promise<Uint8Array> {
    return getRandomBytesAsync(length);
  }

  async sha256(value: Uint8Array): Promise<Uint8Array> {
    // TypeScript 6 distinguishes ArrayBuffer from SharedArrayBuffer-backed
    // views. Copy into a definite ArrayBuffer before crossing the native API.
    const buffer = new ArrayBuffer(value.byteLength);
    const copy = new Uint8Array(buffer);
    copy.set(value);
    try {
      return new Uint8Array(
        await digest(CryptoDigestAlgorithm.SHA256, buffer)
      );
    } finally {
      copy.fill(0);
    }
  }

  async deriveKey(
    passphraseUtf8: Uint8Array,
    parameters: RecoveryKdfParameters
  ): Promise<Uint8Array> {
    if (!this.argon2id) {
      throw new RecoveryKitError(
        "CRYPTO_UNAVAILABLE",
        "Recovery Kit requires an audited Argon2id native module."
      );
    }
    return this.argon2id.derive(passphraseUtf8, parameters);
  }

  async sealAes256Gcm(input: {
    readonly plaintext: Uint8Array;
    readonly key: Uint8Array;
    readonly nonce: Uint8Array;
    readonly additionalData: Uint8Array;
  }): Promise<Uint8Array> {
    const key = await AESEncryptionKey.import(input.key);
    const sealed = await aesEncryptAsync(input.plaintext, key, {
      nonce: { bytes: input.nonce },
      tagLength: 16,
      additionalData: input.additionalData
    });
    const actualNonce = await sealed.iv();
    if (!equalBytes(actualNonce, input.nonce)) {
      throw new RecoveryKitError(
        "CRYPTO_UNAVAILABLE",
        "Expo AES-GCM did not preserve the Recovery Kit nonce."
      );
    }
    return sealed.ciphertext({ includeTag: true });
  }

  async openAes256Gcm(input: {
    readonly ciphertextAndTag: Uint8Array;
    readonly key: Uint8Array;
    readonly nonce: Uint8Array;
    readonly additionalData: Uint8Array;
  }): Promise<Uint8Array> {
    const key = await AESEncryptionKey.import(input.key);
    const sealed = AESSealedData.fromParts(
      input.nonce,
      input.ciphertextAndTag,
      16
    );
    return aesDecryptAsync(sealed, key, {
      additionalData: input.additionalData,
      output: "bytes"
    });
  }
}
