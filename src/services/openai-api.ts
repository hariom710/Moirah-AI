// OpenAI API client — uses OpenAI Platform API credits.
import { OPENAI_API_BASE_URL } from '../shared/constants'

let currentAbortController: AbortController | null = null

export interface OpenAIStreamCallbacks {
  onChunk: (content: string) => void
  onDone: () => void
  onError: (error: string) => void
}

interface ResponseInputContent {
  type: 'input_text' | 'input_image'
  text?: string
  image_url?: string
}

interface ResponseInputMessage {
  role: 'user' | 'assistant'
  content: string | ResponseInputContent[]
}

/**
 * Build a Responses-API request body that preserves role structure.
 * The system prompt goes in `instructions`; conversation turns go in `input`.
 * An optional screenshot is attached to the latest user turn as `input_image`.
 */
export function buildResponsesRequest(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string,
  maxOutputTokens: number,
  imageBase64?: string
): Record<string, unknown> {
  const instructions = messages.find((m) => m.role === 'system')?.content || undefined
  const turns = messages.filter((m) => m.role !== 'system')

  const input: ResponseInputMessage[] = turns.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }))

  if (imageBase64) {
    const lastUser = [...input].reverse().find((m) => m.role === 'user')
    const imagePart: ResponseInputContent = {
      type: 'input_image',
      image_url: `data:image/jpeg;base64,${imageBase64}`
    }
    if (lastUser) {
      const text = typeof lastUser.content === 'string' ? lastUser.content : ''
      lastUser.content = [{ type: 'input_text', text }, imagePart]
    } else {
      input.push({ role: 'user', content: [{ type: 'input_text', text: '' }, imagePart] })
    }
  }

  return {
    model,
    ...(instructions ? { instructions } : {}),
    input,
    max_output_tokens: maxOutputTokens,
    stream: true,
    // Do not persist prompts/completions on OpenAI's side.
    store: false
  }
}

function extractError(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>
    const error = record.error as Record<string, unknown> | undefined
    if (typeof error?.message === 'string') return error.message
    if (typeof record.message === 'string') return record.message
  }
  return 'OpenAI API request failed.'
}

/**
 * Handle one parsed SSE event. Returns true when the event is terminal
 * (the stream must not produce further callbacks after it).
 * Exported for unit tests.
 */
export function handleEvent(eventType: string, data: unknown, callbacks: OpenAIStreamCallbacks): boolean {
  if (typeof data !== 'object' || data === null) return false
  const record = data as Record<string, unknown>

  if (eventType === 'response.output_text.delta' && typeof record.delta === 'string') {
    callbacks.onChunk(record.delta)
  }

  if (eventType === 'response.completed') {
    callbacks.onDone()
    return true
  }

  if (eventType === 'response.incomplete') {
    const reason =
      (record.response as Record<string, unknown> | undefined)?.incomplete_details ??
      record.incomplete_details
    const detail = typeof reason === 'object' && reason !== null
      ? (reason as Record<string, unknown>).reason
      : undefined
    callbacks.onError(
      typeof detail === 'string' && detail
        ? `OpenAI response incomplete (${detail}). Try a larger output limit or a shorter prompt.`
        : 'OpenAI response was cut off before completing. Try again with a shorter prompt.'
    )
    return true
  }

  if (eventType === 'response.failed' || eventType === 'error') {
    callbacks.onError(extractError(record))
    return true
  }

  return false
}

/**
 * Parse one SSE block. Returns true when the block was terminal.
 * Falls back to the JSON `type` field when the SSE `event:` field is absent
 * (some proxies strip event names). Exported for unit tests.
 */
export function processSseBlock(block: string, callbacks: OpenAIStreamCallbacks): boolean {
  let eventType = ''
  const dataLines: string[] = []

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  const rawData = dataLines.join('\n')
  if (!rawData) return false
  if (rawData === '[DONE]') {
    callbacks.onDone()
    return true
  }

  try {
    const parsed = JSON.parse(rawData) as Record<string, unknown>
    const resolvedType = eventType || (typeof parsed.type === 'string' ? parsed.type : '')
    return handleEvent(resolvedType, parsed, callbacks)
  } catch {
    return false
  }
}

export async function streamOpenAICompletion(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string,
  apiKey: string,
  callbacks: OpenAIStreamCallbacks,
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
  const guarded: OpenAIStreamCallbacks = {
    onChunk: (content) => {
      if (!settled) callbacks.onChunk(content)
    },
    onDone: finishOk,
    onError: finishErr
  }

  try {
    const body = buildResponsesRequest(messages, model, maxOutputTokens, imageBase64)
    if ((body.input as unknown[]).length === 0) {
      finishErr('Nothing to send to OpenAI.')
      return
    }

    const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
      finishErr('OpenAI API returned an empty response.')
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
        processSseBlock(block, guarded)
      }
    }

    if (buffer.trim()) {
      processSseBlock(buffer, guarded)
    }

    // Stream ended without a terminal event — treat buffered output as complete.
    finishOk()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      // User cancelled — close the stream as done (renderer already reset its state).
      finishOk()
      return
    }
    const message = err instanceof Error ? err.message : 'Unknown OpenAI API error'
    finishErr(message)
  } finally {
    currentAbortController = null
  }
}

export function cancelOpenAIStream(): void {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}
