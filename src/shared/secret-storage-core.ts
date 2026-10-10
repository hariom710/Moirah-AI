// secret-storage-core.ts — pure OS-keychain encryption logic.
//
// Kept free of Electron imports so it can be unit tested directly
// (see tests/secret-storage.test.ts). store.ts wires the real Electron
// `safeStorage` object in as the backend.
//
// SECURITY CONTRACT: encryptSecret() FAILS CLOSED. If the OS keychain is
// unavailable, or encryption throws, we raise SecretEncryptionError rather
// than returning the raw key. Persisting an API key in plaintext would
// silently break the "stored encrypted on your machine" guarantee.
//
// decryptSecret() deliberately still tolerates legacy plaintext values: keys
// written by older builds (before safeStorage, or on a machine where the
// keychain was unavailable) must keep working, so we hand them back as-is.
// That read tolerance is the migration path — it does not weaken writes.

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

export const SECRET_ENCRYPTION_ERROR_CODE = 'SECRET_ENCRYPTION_UNAVAILABLE'

export class SecretEncryptionError extends Error {
  readonly code = SECRET_ENCRYPTION_ERROR_CODE
  constructor(message: string) {
    super(message)
    this.name = 'SecretEncryptionError'
  }
}

/**
 * Encrypt a secret for at-rest storage. Returns base64 of the keychain blob.
 *
 * Throws SecretEncryptionError when encryption is not possible, so callers
 * abort the write instead of falling back to plaintext. Empty strings
 * short-circuit to '' (no key configured) and never throw.
 */
export function encryptSecret(value: string, safe: SafeStorageLike): string {
  if (!value) return ''

  if (!safe.isEncryptionAvailable()) {
    throw new SecretEncryptionError(
      'OS secure storage is unavailable on this system, so your API key cannot be saved safely. ' +
        'On Linux, install a Secret Service provider such as gnome-keyring or libsecret, then retry.'
    )
  }

  try {
    const encrypted = safe.encryptString(value)
    if (!Buffer.isBuffer(encrypted)) {
      throw new SecretEncryptionError('OS secure storage returned an unexpected value.')
    }
    return encrypted.toString('base64')
  } catch (err) {
    if (err instanceof SecretEncryptionError) throw err
    const detail = err instanceof Error ? err.message : String(err)
    throw new SecretEncryptionError(`Failed to encrypt your API key with OS secure storage: ${detail}`)
  }
}

/**
 * Decrypt a stored secret. Returns the original plaintext.
 *
 * Returns the stored value unchanged when it cannot be decrypted, because it
 * may be a legacy plaintext key from an older build. Never throws.
 */
export function decryptSecret(stored: string, safe: SafeStorageLike): string {
  if (!stored) return ''
  try {
    if (safe.isEncryptionAvailable()) {
      return safe.decryptString(Buffer.from(stored, 'base64'))
    }
  } catch {
    // Fall through — treat as a legacy plaintext value.
  }
  return stored
}

/**
 * True when a stored value failed to decrypt and is therefore a legacy
 * plaintext key that should be re-encrypted on the next successful save.
 */
export function isLegacyPlaintextSecret(stored: string, safe: SafeStorageLike): boolean {
  if (!stored) return false
  if (!safe.isEncryptionAvailable()) return false
  try {
    safe.decryptString(Buffer.from(stored, 'base64'))
    return false // decrypted fine -> already encrypted
  } catch {
    return true // failed to decrypt -> legacy plaintext
  }
}
