import { argon2idAsync } from "@noble/hashes/argon2.js";

const expected =
  "6ad10af97f1744119bd7135c85121dc589794f9c5d646200b8ad4d6becf15084";
const password = new TextEncoder().encode(
  "correct horse battery staple"
);
const salt = new Uint8Array(16).fill(7);
let derived;

try {
  derived = await argon2idAsync(password, salt, {
    version: 0x13,
    t: 3,
    m: 65_536,
    p: 1,
    dkLen: 32,
    maxmem: 65_536 * 1024,
    asyncTick: 12
  });
  const actual = Buffer.from(derived).toString("hex");
  if (actual !== expected) {
    throw new Error(
      `Argon2id recovery vector mismatch: expected ${expected}, received ${actual}.`
    );
  }
  process.stdout.write(
    "Recovery Argon2id vector passed (64 MiB, t=3, p=1, 32 bytes).\n"
  );
} finally {
  password.fill(0);
  salt.fill(0);
  derived?.fill(0);
}
