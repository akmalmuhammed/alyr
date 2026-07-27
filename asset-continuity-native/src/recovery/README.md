# ALYR Recovery Kit core

`ALYR-Recovery-YYYY-MM-DD.alyrkit` is a **local encrypted export**, not a cloud
backup claim. The core is route/provider independent so the product can add a
reviewed export and restore UI later.

## Container v1

```text
8 bytes  magic: "ALYRKIT\0"
2 bytes  big-endian container version
4 bytes  canonical JSON header length
4 bytes  ciphertext + GCM tag length
N bytes  canonical JSON crypto header
M bytes  AES-256-GCM ciphertext + 16-byte tag
```

The preamble and crypto header are AES-GCM additional authenticated data. The
encrypted payload contains a canonical manifest, the canonical workspace
snapshot, the 32-byte attachment-vault key (only when attachments exist), and
the existing `.alyrblob` protected bytes. Every payload range has SHA-256
metadata and must be contiguous. Import rejects trailing bytes, overlapping
ranges, duplicate IDs, non-canonical JSON/base64/UTF-8, size disagreement,
checksum failure, an unsupported version, or AES-GCM authentication failure.
Wrong passphrases and modified ciphertext intentionally share
`AUTHENTICATION_FAILED`.

Including the attachment-vault key inside the passphrase-encrypted payload is
required for portability: copying `.alyrblob` bytes alone to a new installation
would leave them unreadable. Restore adapters must reject a conflicting current
vault key and generate opaque destination paths rather than using imported
display names.

## Cryptography gate

Expo Crypto SDK 57 supplies native CSPRNG, SHA-256, and AES-256-GCM. The signed
runtime injects `NobleRecoveryArgon2id`, backed by the independently audited,
zero-dependency `@noble/hashes` RFC 9106 implementation. Its async derivation
yields to the React Native event loop and wipes the working matrix when it
finishes. `ExpoRecoveryCrypto` still fails closed when no Argon2id port is
injected. There is no fast-hash, repeated-SHA, or low-cost PBKDF fallback.

Container v1 fixes Argon2id parameters at a 64 MiB memory cost, 3 iterations,
parallelism 1, a random 16-byte salt, and a 32-byte output. Import accepts only
bounded stronger-compatible v1 parameters (64–256 MiB, 3–10 iterations,
parallelism 1–4) to prevent attacker-controlled KDF resource exhaustion.

`npm run verify:recovery-crypto --workspace=@alyr/native` executes the full
64 MiB/t=3/p=1 known-answer vector outside Jest. Focused Jest tests verify the
authenticated parameter mapping and disposable-input zeroing without making
every UI test allocate the KDF working matrix.

## Runtime availability

`createSignedRecoveryJourneyRuntime` enables create/share/import/restore only
when all of these statements are true:

- the runtime profile is the installed `native-secure` profile;
- a verified personal household is active;
- SQLCipher metadata storage and the encrypted attachment vault are open;
- the attachment store supplies staged recovery restore capabilities.

Expo Go, web, test previews, signed-out sessions, locked devices, sample
workspaces, mismatched households, pending outbox operations, and unresolved
sync conflicts remain visibly unavailable or fail closed before replacement.
The iOS share sheet receives only the final authenticated `.alyrkit`; the
document picker copies only the still-encrypted container into cache.

The remaining signed-device gate is empirical rather than architectural:
create a kit containing at least one image and one document on a physical
iPhone, save it through the iOS share sheet, reinstall the signed build, import
the kit, verify the attachment bytes, and repeat with a wrong passphrase, one
flipped ciphertext byte, and a version-2 preamble. Expo Go is intentionally not
a substitute for this gate.

## Bounded memory/file policy

- encrypted kit: 64 MiB maximum
- decrypted payload held in memory: 48 MiB maximum
- workspace JSON: 8 MiB maximum
- manifest: 256 KiB maximum
- protected attachments: 256 maximum
- each protected attachment: 10 MiB + 256 bytes maximum
- passphrase: 12 Unicode code points minimum, 1 KiB UTF-8 maximum

The current core assembles/decrypts one bounded payload in memory. It never
writes workspace plaintext, the attachment key, or decrypted payload to a temp
file. File adapters receive only the final encrypted `.alyrkit` or already
device-vault-encrypted `.alyrblob` bytes. A future larger format must introduce
reviewed chunked AEAD records rather than increasing these limits.

## Integration API

1. Read `.alyrblob` sources with `RecoveryProtectedAttachmentReadPort`.
2. Call `createRecoveryKit`, or `createAndStoreRecoveryKit` for an atomic
   encrypted-file write.
3. Call `openRecoveryKit`, or `readAndOpenRecoveryKit` for bounded file input.
4. Validate current account/household, explicit destructive confirmation,
   available disk space, workspace migration support, and vault-key conflicts.
5. Apply via `restoreRecoveryKitAtomically`; its adapter stages key,
   attachments, then workspace and exposes nothing before commit.
6. Call `disposeRecoveredKit` after the adapter has copied protected buffers.

The restore port must namespace data by the authenticated account/household and
must not merge a kit into another signed-in household implicitly.
