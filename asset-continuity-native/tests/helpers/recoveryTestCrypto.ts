declare const require: (identifier: string) => any;
const {
  createCipheriv,
  createDecipheriv,
  createHash
} = require("node:crypto");
const NodeBuffer = require("node:buffer").Buffer;

import type {
  RecoveryCryptoPort,
  RecoveryKdfParameters
} from "@/recovery";

export class RecoveryTestCrypto implements RecoveryCryptoPort {
  private randomCursor = 1;

  async randomBytes(length: number): Promise<Uint8Array> {
    const result = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      result[index] = this.randomCursor++ & 0xff;
    }
    return result;
  }

  async sha256(value: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(createHash("sha256").update(value).digest());
  }

  async deriveKey(
    passphraseUtf8: Uint8Array,
    parameters: RecoveryKdfParameters
  ): Promise<Uint8Array> {
    return new Uint8Array(
      createHash("sha256")
        .update(passphraseUtf8)
        .update(parameters.salt)
        .update(
          Uint8Array.of(
            parameters.iterations,
            parameters.parallelism,
            parameters.memoryKiB >>> 16,
            parameters.memoryKiB >>> 8,
            parameters.memoryKiB
          )
        )
        .digest()
    );
  }

  async sealAes256Gcm(input: {
    readonly plaintext: Uint8Array;
    readonly key: Uint8Array;
    readonly nonce: Uint8Array;
    readonly additionalData: Uint8Array;
  }): Promise<Uint8Array> {
    const cipher = createCipheriv("aes-256-gcm", input.key, input.nonce, {
      authTagLength: 16
    });
    cipher.setAAD(input.additionalData);
    const ciphertext = NodeBuffer.concat([
      cipher.update(input.plaintext),
      cipher.final()
    ]);
    return new Uint8Array(
      NodeBuffer.concat([ciphertext, cipher.getAuthTag()])
    );
  }

  async openAes256Gcm(input: {
    readonly ciphertextAndTag: Uint8Array;
    readonly key: Uint8Array;
    readonly nonce: Uint8Array;
    readonly additionalData: Uint8Array;
  }): Promise<Uint8Array> {
    const tagOffset = input.ciphertextAndTag.byteLength - 16;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      input.key,
      input.nonce,
      { authTagLength: 16 }
    );
    decipher.setAAD(input.additionalData);
    decipher.setAuthTag(input.ciphertextAndTag.slice(tagOffset));
    return new Uint8Array(
      NodeBuffer.concat([
        decipher.update(input.ciphertextAndTag.slice(0, tagOffset)),
        decipher.final()
      ])
    );
  }
}
