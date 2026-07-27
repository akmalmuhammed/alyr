import {
  NobleRecoveryArgon2id,
  type RecoveryArgon2idDeriver
} from "@/recovery/expoCrypto";
import { RecoveryKitError } from "@/recovery/types";

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

describe("signed Recovery Kit Argon2id", () => {
  it("passes the authenticated mobile profile to Argon2id exactly", async () => {
    const password = new TextEncoder().encode(
      "correct horse battery staple"
    );
    const salt = new Uint8Array(16).fill(7);
    const expected = new Uint8Array(32).fill(0xa7);
    let observedPassword: Uint8Array | null = null;
    let observedSalt: Uint8Array | null = null;
    const derive: jest.MockedFunction<RecoveryArgon2idDeriver> =
      jest.fn(async (inputPassword, inputSalt, _options) => {
        observedPassword = inputPassword.slice();
        observedSalt = inputSalt.slice();
        return expected.slice();
      });
    const derived = await new NobleRecoveryArgon2id(derive).derive(password, {
      algorithm: "argon2id",
      salt,
      memoryKiB: 65_536,
      iterations: 3,
      parallelism: 1,
      keyBytes: 32
    });

    expect(hex(derived)).toBe("a7".repeat(32));
    expect(derive).toHaveBeenCalledTimes(1);
    const [derivedPassword, derivedSalt, options] = derive.mock.calls[0]!;
    expect(derivedPassword).not.toBe(password);
    expect(derivedSalt).not.toBe(salt);
    expect(observedPassword).toEqual(password);
    expect(observedSalt).toEqual(salt);
    expect(options).toEqual({
      version: 0x13,
      t: 3,
      m: 65_536,
      p: 1,
      dkLen: 32,
      maxmem: 65_536 * 1024,
      asyncTick: 12
    });
    // The adapter wipes its disposable inputs after the KDF returns.
    expect(derivedPassword).toEqual(new Uint8Array(password.byteLength));
    expect(derivedSalt).toEqual(new Uint8Array(salt.byteLength));
    // The adapter works on disposable copies; ownership of caller buffers does
    // not change until the Recovery Kit core clears them in its own `finally`.
    expect(password.byteLength).toBe(28);
    expect(salt).toEqual(new Uint8Array(16).fill(7));

    derived.fill(0);
    password.fill(0);
    salt.fill(0);
  });

  it("rejects a header outside the reviewed mobile bounds", async () => {
    await expect(
      new NobleRecoveryArgon2id().derive(
        new TextEncoder().encode("long-enough-passphrase"),
        {
          algorithm: "argon2id",
          salt: new Uint8Array(16),
          memoryKiB: 32_768,
          iterations: 3,
          parallelism: 1,
          keyBytes: 32
        }
      )
    ).rejects.toMatchObject<Partial<RecoveryKitError>>({
      code: "CRYPTO_UNAVAILABLE"
    });
  });
});
