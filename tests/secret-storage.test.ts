import { describe, it, expect, vi } from 'vitest'
import {
  SECRET_ENCRYPTION_ERROR_CODE,
  SecretEncryptionError,
  decryptSecret,
  encryptSecret,
  isLegacyPlaintextSecret,
  type SafeStorageLike
} from '../src/shared/secret-storage-core'

// --- Fake backends -------------------------------------------------------

/** Simulates a working OS keychain (Windows DPAPI / macOS Keychain). */
function workingSafeStorage(): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    // Reversible stand-in: not real crypto, but proves round-tripping and
    // that the plaintext never survives into the stored form. Like the real
    // safeStorage, it THROWS on data it did not encrypt (legacy plaintext).
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (encrypted: Buffer) => {
      const text = encrypted.toString('utf8')
      if (!text.startsWith('enc:')) throw new Error('bad decrypt')
      return text.slice(4)
    }
  }
}

/** Simulates a system with no keychain (Linux without libsecret/gnome-keyring). */
function unavailableSafeStorage(): SafeStorageLike {
  return {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('encryptString should never be called when unavailable')
    },
    decryptString: () => {
      throw new Error('decryptString should never be called when unavailable')
    }
  }
}

/** Simulates a keychain that exists but throws on encrypt (e.g. locked keyring). */
function throwingSafeStorage(): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    encryptString: () => {
      throw new Error('keyring is locked')
    },
    decryptString: () => {
      throw new Error('nope')
    }
  }
}

// --- encryptSecret: FAILS CLOSED ----------------------------------------

describe('encryptSecret — fails closed (P1 fix)', () => {
  const KEY = 'sk-or-v1-abc123def456'

  it('returns base64 of the keychain blob when encryption is available', () => {
    const out = encryptSecret(KEY, workingSafeStorage())
    expect(out).toBe(Buffer.from(`enc:${KEY}`, 'utf8').toString('base64'))
  })

  it('never returns the plaintext key in the stored value', () => {
    const out = encryptSecret(KEY, workingSafeStorage())
    expect(out).not.toContain(KEY)
    // Round-trips back to the original.
    expect(decryptSecret(out, workingSafeStorage())).toBe(KEY)
  })

  it('THROWS when safeStorage is unavailable instead of storing plaintext', () => {
    // Regression: this used to log a warning and return the raw key.
    expect(() => encryptSecret(KEY, unavailableSafeStorage())).toThrow(SecretEncryptionError)
  })

  it('the unavailable-path error carries a stable code and actionable message', () => {
    let caught: unknown
    try {
      encryptSecret(KEY, unavailableSafeStorage())
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(SecretEncryptionError)
    const e = caught as SecretEncryptionError
    expect(e.code).toBe(SECRET_ENCRYPTION_ERROR_CODE)
    expect(e.message).toMatch(/secure storage is unavailable/i)
    expect(e.message).toMatch(/gnome-keyring|libsecret/i) // tells Linux users the fix
  })

  it('THROWS (not silently downgrades) when encryptString itself throws', () => {
    expect(() => encryptSecret(KEY, throwingSafeStorage())).toThrow(SecretEncryptionError)
    expect(() => encryptSecret(KEY, throwingSafeStorage())).toThrow(/keyring is locked/)
  })

  it('does not leak the plaintext into the thrown message', () => {
    expect(() => encryptSecret(KEY, throwingSafeStorage())).not.toThrow(KEY)
  })

  it('treats a non-Buffer encryptString return as a failure', () => {
    const bad: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      // A misbehaving backend returning a string must not be trusted.
      encryptString: (() => 'not-a-buffer') as unknown as SafeStorageLike['encryptString'],
      decryptString: () => ''
    }
    expect(() => encryptSecret(KEY, bad)).toThrow(SecretEncryptionError)
  })

  it('short-circuits empty values without consulting the keychain', () => {
    // An unset key must never block a save, even on a keychain-less system.
    expect(encryptSecret('', unavailableSafeStorage())).toBe('')
    expect(encryptSecret('', throwingSafeStorage())).toBe('')
  })
})

// --- decryptSecret: legacy plaintext migration PRESERVED -----------------

describe('decryptSecret — legacy plaintext migration', () => {
  it('round-trips an encrypted value', () => {
    const stored = encryptSecret('AIza' + 'x'.repeat(30), workingSafeStorage())
    expect(decryptSecret(stored, workingSafeStorage())).toBe('AIza' + 'x'.repeat(30))
  })

  it('returns a LEGACY PLAINTEXT key unchanged (migration path)', () => {
    // A key written by an older build / keychain-less machine must keep
    // working after upgrade, not be destroyed or turned into garbage.
    const legacyPlaintext = 'sk-legacy-key-stored-in-the-clear'
    expect(decryptSecret(legacyPlaintext, workingSafeStorage())).toBe(legacyPlaintext)
  })

  it('returns plaintext unchanged when the keychain is unavailable', () => {
    // Read side must degrade gracefully; only writes are blocked.
    expect(decryptSecret('some-stored-value', unavailableSafeStorage())).toBe('some-stored-value')
  })

  it('returns the stored value when decryption throws (corrupt blob)', () => {
    const safe: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      encryptString: (p) => Buffer.from(p),
      decryptString: () => {
        throw new Error('bad padding')
      }
    }
    expect(decryptSecret('not-valid-base64-blob', safe)).toBe('not-valid-base64-blob')
  })

  it('returns empty string for empty input', () => {
    expect(decryptSecret('', workingSafeStorage())).toBe('')
    expect(decryptSecret('', unavailableSafeStorage())).toBe('')
  })

  it('never throws, regardless of backend', () => {
    expect(() => decryptSecret('x', throwingSafeStorage())).not.toThrow()
    expect(() => decryptSecret('x', unavailableSafeStorage())).not.toThrow()
  })
})

// --- isLegacyPlaintextSecret (migration detection) -----------------------

describe('isLegacyPlaintextSecret', () => {
  it('flags a value that fails to decrypt as legacy plaintext', () => {
    expect(isLegacyPlaintextSecret('sk-legacy-in-the-clear', workingSafeStorage())).toBe(true)
  })

  it('does not flag a properly encrypted value', () => {
    const stored = encryptSecret('sk-real-key', workingSafeStorage())
    expect(isLegacyPlaintextSecret(stored, workingSafeStorage())).toBe(false)
  })

  it('returns false when no keychain is present (cannot tell)', () => {
    expect(isLegacyPlaintextSecret('anything', unavailableSafeStorage())).toBe(false)
  })

  it('returns false for empty input', () => {
    expect(isLegacyPlaintextSecret('', workingSafeStorage())).toBe(false)
  })
})

// --- No plaintext fallback anywhere --------------------------------------

describe('no plaintext fallback path exists', () => {
  it('encryptSecret never returns its own input when input is non-empty', () => {
    // Property-style check across every backend: the raw key must never
    // come back out of the encrypt path.
    const key = 'sk-or-v1-canary-value'
    for (const safe of [workingSafeStorage(), unavailableSafeStorage(), throwingSafeStorage()]) {
      let returned: string | undefined
      try {
        returned = encryptSecret(key, safe)
      } catch {
        returned = undefined // threw — that is the correct fail-closed outcome
      }
      expect(returned).not.toBe(key)
    }
    vi.restoreAllMocks()
  })
})
