// Gemini API client — direct Google AI Studio REST API.
// Uses fetch + SSE (same pattern as openai-api.ts) — no extra SDK dependency.
// Supports streaming text + inline base64 images (all curated Gemini models are vision-capable).
import { GEMINI_BASE_URL } from '../shared/constants'

let currentAbortController: AbortController | null = null

export interface GeminiStreamCallbacks {
  onChunk: (content: string) => void
  onDone: () => void
  onError: (error: string) => void
}

export interface GeminiMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

/**
 * Build a streamGenerateContent request body that preserves role structure.
 * The system prompt goes in `systemInstruction`; conversation turns map
 * user -> 'user' and assistant -> 'model'. An optional screenshot is
 * attached to the latest user turn as an inlineData part.
 */
export function buildGeminiRequest(
  messages: GeminiMessage[],
  maxOutputTokens: number,
  imageBase64?: string
): Record<string, unknown> {
  const systemText = messages.find((m) => m.role === 'system')?.content
  const turns = messages.filter((m) => m.role !== 'system')

  const contents: GeminiContent[] = turns.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))

  if (imageBase64) {
    const lastUser = [...contents].reverse().find((c) => c.role === 'user')
    const imagePart: GeminiPart = {
      inlineData: { mimeType: 'image/jpeg', data: imageBase64 }
    }
    if (lastUser) {
      lastUser.parts.push(imagePart)
    } else {
      contents.push({ role: 'user', parts: [{ text: '' }, imagePart] })
    }
  }

  return {
    contents,
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    generationConfig: { maxOutputTokens }
  }
}

function extractError(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>
    const error = record.error as Record<string, unknown> | undefined
    if (typeof error?.message === 'string') return error.message
    if (typeof record.message === 'string') return record.message
  }
  return 'Gemini API request failed.'
}

/**
 * Handle one parsed SSE data payload. Gemini sends JSON chunks shaped like
 * { candidates: [{ content: { parts: [{ text }] } }] }. There is no terminal
 * event type — completion is signalled by the stream ending. Exported for tests.
 */
export function handleGeminiChunk(data: unknown, callbacks: GeminiStreamCallbacks): void {
  if (typeof data !== 'object' || data === null) return
  const record = data as Record<string, unknown>

  // Surface prompt feedback / errors embedded in the stream
  const promptFeedback = record.promptFeedback as Record<string, unknown> | undefined
  if (promptFeedback && typeof promptFeedback.blockReason === 'string') {
    callbacks.onError(`Gemini blocked the response (${promptFeedback.blockReason}).`)
    return
  }

  const candidates = record.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return

  const candidate = candidates[0] as Record<string, unknown>
  const content = candidate.content as Record<string, unknown> | undefined
  const parts = content?.parts
  if (!Array.isArray(parts)) return

  for (const part of parts) {
    if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
      const text = (part as Record<string, unknown>).text as string
      if (text) callbacks.onChunk(text)
    }
  }
}

/**
 * Parse one SSE block ("data: {...}"). Returns true when the block was an
 * error that must terminate the stream. Exported for unit tests.
 */
export function processGeminiSseBlock(block: string, callbacks: GeminiStreamCallbacks): boolean {
  const dataLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  const rawData = dataLines.join('\n')
  if (!rawData) return false

  let parsed: unknown
  try {
    parsed = JSON.parse(rawData)
  } catch {
    return false
  }

  // An error object in the payload terminates the stream
  if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
    callbacks.onError(extractError(parsed))
    return true
  }

  handleGeminiChunk(parsed, callbacks)
  return false
}

export async function streamGeminiCompletion(
  messages: GeminiMessage[],
  model: string,
  apiKey: string,
  callbacks: GeminiStreamCallbacks,
  maxOutputTokens = 1500,
  imageBase64?: string
): Promise<void> {
  currentAbortController = new AbortController()

  // Exactly one terminal callback per request — no hangs, no double-fires.
  let settled = false
  const finishOk = () => {
    if (!settled) {
      settled = true
      callbacks.onDone()
    }
  }
  const finishErr = (message: string) => {
    if (!settled) {
      settled = true
      callbacks.onError(message)
    }
  }
  const guarded: GeminiStreamCallbacks = {
    onChunk: (content) => {
      if (!settled) callbacks.onChunk(content)
    },
    onDone: finishOk,
    onError: finishErr
  }

  try {
    const body = buildGeminiRequest(messages, maxOutputTokens, imageBase64)
    if ((body.contents as unknown[]).length === 0) {
      finishErr('Nothing to send to Gemini.')
      return
    }

    const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: currentAbortController.signal
    })

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`
      try {
        const data = await response.json()
        message = extractError(data)
      } catch {
        // Keep HTTP status as the error message.
      }
      finishErr(message)
      return
    }

    if (!response.body) {
      finishErr('Gemini API returned an empty response.')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        processGeminiSseBlock(block, guarded)
      }
    }

    if (buffer.trim()) {
      processGeminiSseBlock(buffer, guarded)
    }

    // Gemini has no terminal SSE event — the stream ending IS completion.
    finishOk()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      finishOk()
      return
    }
    const message = err instanceof Error ? err.message : 'Unknown Gemini API error'
    finishErr(message)
  } finally {
    currentAbortController = null
  }
}

export function cancelGeminiStream(): void {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}

/**
 * Validate a Gemini API key by listing models. Returns true when the key works.
 */
export async function validateGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${GEMINI_BASE_URL}?key=${encodeURIComponent(apiKey)}&pageSize=1`, {
      method: 'GET'
    })
    return response.ok
  } catch {
    return false
  }
}
