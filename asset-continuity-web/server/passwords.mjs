import {
  randomBytes,
  scrypt as scryptCallback,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 256;

const DUMMY_SALT = Buffer.from(
  "continuity-local-dummy-salt-v1",
  "utf8",
).subarray(0, 16);
const DUMMY_PASSWORD_RECORD = Object.freeze({
  algorithm: "scrypt",
  n: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  keyBytes: SCRYPT_KEY_BYTES,
  salt: DUMMY_SALT.toString("base64"),
  hash: scryptSync("continuity-invalid-password", DUMMY_SALT, SCRYPT_KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  }).toString("base64"),
});

export class PasswordValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PasswordValidationError";
    this.code = "INVALID_PASSWORD";
  }
}

export function validatePasswordInput(password) {
  if (typeof password !== "string") {
    throw new PasswordValidationError("Password must be a string.");
  }
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new PasswordValidationError(
      `Use a password between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }
  return password;
}

function isPasswordRecord(value) {
  return (
    value &&
    value.algorithm === "scrypt" &&
    value.n === SCRYPT_N &&
    value.r === SCRYPT_R &&
    value.p === SCRYPT_P &&
    value.keyBytes === SCRYPT_KEY_BYTES &&
    typeof value.salt === "string" &&
    typeof value.hash === "string"
  );
}

async function derive(password, record) {
  const salt = Buffer.from(record.salt, "base64");
  if (salt.byteLength !== 16) {
    throw new PasswordValidationError("Stored password metadata is invalid.");
  }
  return Buffer.from(
    await scrypt(password, salt, record.keyBytes, {
      N: record.n,
      r: record.r,
      p: record.p,
      maxmem: SCRYPT_MAX_MEMORY,
    }),
  );
}

export async function hashPassword(password) {
  const normalized = validatePasswordInput(password);
  const salt = randomBytes(16);
  const record = {
    algorithm: "scrypt",
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    keyBytes: SCRYPT_KEY_BYTES,
    salt: salt.toString("base64"),
  };
  const hash = await derive(normalized, record);
  return Object.freeze({
    ...record,
    hash: hash.toString("base64"),
  });
}

export async function verifyPassword(password, record) {
  const candidate =
    typeof password === "string" && password.length <= PASSWORD_MAX_LENGTH
      ? password
      : "";
  const safeRecord = isPasswordRecord(record)
    ? record
    : DUMMY_PASSWORD_RECORD;
  let actual;
  try {
    actual = await derive(candidate, safeRecord);
  } catch {
    actual = Buffer.alloc(SCRYPT_KEY_BYTES);
  }
  let expected;
  try {
    expected = Buffer.from(safeRecord.hash, "base64");
  } catch {
    expected = Buffer.alloc(SCRYPT_KEY_BYTES);
  }
  if (
    expected.byteLength !== SCRYPT_KEY_BYTES ||
    actual.byteLength !== SCRYPT_KEY_BYTES
  ) {
    timingSafeEqual(
      Buffer.alloc(SCRYPT_KEY_BYTES),
      Buffer.alloc(SCRYPT_KEY_BYTES),
    );
    return false;
  }
  return isPasswordRecord(record) && timingSafeEqual(actual, expected);
}

