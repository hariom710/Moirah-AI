// audio-payload.ts — pure validation for incoming audio transcription payloads.
//
// Extracted from the AUDIO_TRANSCRIBE IPC handler so the size cap and type
// checks are unit-testable without Electron (tests/audio-payload.test.ts).

/**
 * Maximum accepted audio payload, in bytes.
 *
 * ~25MB of opus audio is roughly 25+ minutes of a single recording chunk —
 * far above what the rolling recorder ever hands us in one call (about 1MB
 * of opus per minute). The cap exists so a malformed or hostile renderer
 * cannot force the main process to allocate an unbounded buffer.
 */
export const MAX_AUDIO_PAYLOAD_BYTES = 25 * 1024 * 1024

/** Error thrown when an audio payload is rejected. */
export class AudioPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AudioPayloadError'
  }
}

/**
 * Convert a raw IPC audio payload into a Buffer, enforcing type + size.
 *
 * Accepts Buffer, ArrayBuffer, or any ArrayBufferView (e.g. Uint8Array,
 * which is what Electron's structured clone actually delivers for typed
 * arrays). Throws AudioPayloadError for anything else — including strings,
 * which the previous implementation silently coerced via
 * `Buffer.from(audioData as ArrayBuffer)` and forwarded as garbage.
 */
export function toAudioBuffer(audioData: unknown): Buffer {
  let buffer: Buffer

  if (Buffer.isBuffer(audioData)) {
    buffer = audioData
  } else if (audioData instanceof ArrayBuffer) {
    buffer = Buffer.from(audioData)
  } else if (ArrayBuffer.isView(audioData)) {
    buffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength)
  } else {
    throw new AudioPayloadError(
      'Invalid audio payload: expected binary audio data (Buffer, ArrayBuffer, or typed array).'
    )
  }

  if (buffer.byteLength === 0) {
    throw new AudioPayloadError('Audio payload is empty — nothing to transcribe.')
  }

  if (buffer.byteLength > MAX_AUDIO_PAYLOAD_BYTES) {
    throw new AudioPayloadError(
      `Audio payload too large (${buffer.byteLength} bytes; max ${MAX_AUDIO_PAYLOAD_BYTES}). ` +
        'Try a shorter recording.'
    )
  }

  return buffer
}
