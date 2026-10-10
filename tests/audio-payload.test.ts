import { describe, it, expect } from 'vitest'
import {
  AudioPayloadError,
  MAX_AUDIO_PAYLOAD_BYTES,
  toAudioBuffer
} from '../src/shared/audio-payload'

// Regression coverage for the AUDIO_TRANSCRIBE payload hardening: the old
// handler ended in `Buffer.from(audioData as ArrayBuffer)` — a loose cast that
// silently coerced malformed payloads into garbage bytes, with no size cap.
describe('toAudioBuffer — AUDIO_TRANSCRIBE payload validation', () => {
  const MB = 1024 * 1024

  it('documents a maximum payload size', () => {
    expect(MAX_AUDIO_PAYLOAD_BYTES).toBe(25 * MB)
  })

  it('accepts a Buffer as-is', () => {
    const buf = Buffer.from([1, 2, 3, 4])
    const out = toAudioBuffer(buf)
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out).toEqual(buf)
  })

  it('accepts an ArrayBuffer', () => {
    const ab = new ArrayBuffer(4)
    const out = toAudioBuffer(ab)
    expect(out.byteLength).toBe(4)
  })

  it('accepts a Uint8Array (what Electron structured clone actually delivers)', () => {
    const u8 = new Uint8Array([9, 8, 7])
    const out = toAudioBuffer(u8)
    expect(out).toEqual(Buffer.from([9, 8, 7]))
  })

  it('accepts a non-zero-offset typed-array view without padding bytes', () => {
    // Explicit ArrayBuffer (NOT Buffer.from — Node Buffers come from a pool,
    // so .buffer/.byteOffset do not point at the bytes you think).
    const backing = new ArrayBuffer(7)
    new Uint8Array(backing).set([0, 0, 1, 2, 3, 0, 0])
    const view = new Uint8Array(backing, 2, 3)
    const out = toAudioBuffer(view)
    expect(out).toEqual(Buffer.from([1, 2, 3]))
  })

  it('REJECTS a string instead of coercing it to garbage bytes', () => {
    // Old behavior: Buffer.from(str as ArrayBuffer) produced bogus audio.
    expect(() => toAudioBuffer('not-audio')).toThrow(AudioPayloadError)
    expect(() => toAudioBuffer('not-audio')).toThrow(/expected binary audio data/i)
  })

  it('REJECTS null / undefined / numbers / plain objects', () => {
    expect(() => toAudioBuffer(null)).toThrow(AudioPayloadError)
    expect(() => toAudioBuffer(undefined)).toThrow(AudioPayloadError)
    expect(() => toAudioBuffer(12345)).toThrow(AudioPayloadError)
    expect(() => toAudioBuffer({})).toThrow(AudioPayloadError)
    expect(() => toAudioBuffer([])).toThrow(AudioPayloadError)
  })

  it('REJECTS an empty payload (nothing to transcribe)', () => {
    // Empty buffer would previously be forwarded to the provider and produce a
    // confusing upstream error; fail locally and clearly instead.
    expect(() => toAudioBuffer(Buffer.alloc(0))).toThrow(AudioPayloadError)
    expect(() => toAudioBuffer(new ArrayBuffer(0))).toThrow(AudioPayloadError)
  })

  it('accepts a payload just under the cap', () => {
    const near = Buffer.alloc(MAX_AUDIO_PAYLOAD_BYTES - 1)
    expect(toAudioBuffer(near).byteLength).toBe(MAX_AUDIO_PAYLOAD_BYTES - 1)
  })

  it('accepts a payload exactly at the cap', () => {
    const exact = Buffer.alloc(MAX_AUDIO_PAYLOAD_BYTES)
    expect(toAudioBuffer(exact).byteLength).toBe(MAX_AUDIO_PAYLOAD_BYTES)
  })

  it('REJECTS a payload over the cap', () => {
    const over = Buffer.alloc(MAX_AUDIO_PAYLOAD_BYTES + 1)
    expect(() => toAudioBuffer(over)).toThrow(AudioPayloadError)
    expect(() => toAudioBuffer(over)).toThrow(/too large/i)
  })

  it('includes the actual size and the limit in the oversize error', () => {
    const over = Buffer.alloc(MAX_AUDIO_PAYLOAD_BYTES + 1)
    let msg = ''
    try {
      toAudioBuffer(over)
    } catch (err) {
      msg = (err as Error).message
    }
    expect(msg).toContain(String(over.byteLength))
    expect(msg).toContain(String(MAX_AUDIO_PAYLOAD_BYTES))
  })
})
