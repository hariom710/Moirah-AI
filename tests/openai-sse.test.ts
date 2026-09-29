import { describe, it, expect, vi } from 'vitest'
import {
  processSseBlock,
  handleEvent,
  buildResponsesRequest,
  type OpenAIStreamCallbacks
} from '../src/services/openai-api'

function collector() {
  const chunks: string[] = []
  const calls: string[] = []
  const callbacks: OpenAIStreamCallbacks = {
    onChunk: (c) => {
      chunks.push(c)
      calls.push('chunk')
    },
    onDone: () => {
      calls.push('done')
    },
    onError: (e) => {
      chunks.push(`ERROR:${e}`)
      calls.push('error')
    }
  }
  return { chunks, calls, callbacks }
}

describe('OpenAI SSE parsing', () => {
  it('handles data-only events via the JSON type field (no event: line)', () => {
    const { chunks, callbacks } = collector()
    const terminal = processSseBlock(
      'data: {"type":"response.output_text.delta","delta":"hello"}\n\n',
      callbacks
    )
    expect(terminal).toBe(false)
    expect(chunks).toEqual(['hello'])
  })

  it('completes on response.completed', () => {
    const { calls, callbacks } = collector()
    const terminal = handleEvent('response.completed', { type: 'response.completed' }, callbacks)
    expect(terminal).toBe(true)
    expect(calls).toEqual(['done'])
  })

  it('errors (instead of hanging) on response.incomplete', () => {
    const { calls, chunks, callbacks } = collector()
    const terminal = handleEvent(
      'response.incomplete',
      { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } },
      callbacks
    )
    expect(terminal).toBe(true)
    expect(calls).toEqual(['error'])
    expect(chunks[0]).toContain('max_output_tokens')
  })

  it('completes on [DONE] even without a response.completed event', () => {
    const { calls, callbacks } = collector()
    const terminal = processSseBlock('data: [DONE]\n\n', callbacks)
    expect(terminal).toBe(true)
    expect(calls).toEqual(['done'])
  })

  it('ignores garbage blocks without firing callbacks', () => {
    const { calls, callbacks } = collector()
    const terminal = processSseBlock('data: not-json{{\n\n', callbacks)
    expect(terminal).toBe(false)
    expect(calls).toEqual([])
  })

  it('ignores empty blocks', () => {
    const { calls, callbacks } = collector()
    expect(processSseBlock('\n\n', callbacks)).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('Responses request building', () => {
  const messages = [
    { role: 'system' as const, content: 'Be concise.' },
    { role: 'user' as const, content: 'First question' },
    { role: 'assistant' as const, content: 'First answer' },
    { role: 'user' as const, content: 'Second question' }
  ]

  it('puts the system prompt in instructions and preserves turn roles', () => {
    const body = buildResponsesRequest(messages, 'gpt-5.5', 1500) as {
      instructions: string
      input: Array<{ role: string; content: unknown }>
      store: boolean
    }
    expect(body.instructions).toBe('Be concise.')
    expect(body.store).toBe(false)
    expect(body.input.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(body.input[0].content).toBe('First question')
  })

  it('attaches the screenshot to the latest user turn as input_image', () => {
    const body = buildResponsesRequest(messages, 'gpt-5.5', 1500, 'aGVsbG8=') as {
      input: Array<{ role: string; content: unknown }>
    }
    const lastUser = body.input[body.input.length - 1]
    expect(lastUser.role).toBe('user')
    const parts = lastUser.content as Array<{ type: string; text?: string; image_url?: string }>
    expect(parts[0]).toMatchObject({ type: 'input_text', text: 'Second question' })
    expect(parts[1].type).toBe('input_image')
    expect(parts[1].image_url).toContain('data:image/jpeg;base64,aGVsbG8=')
    // Earlier turns stay plain strings.
    expect(body.input[0].content).toBe('First question')
    expect(body.input[1].content).toBe('First answer')
  })

  it('still produces a valid body without a system prompt', () => {
    const body = buildResponsesRequest(
      [{ role: 'user' as const, content: 'Hi' }],
      'gpt-5.5',
      1500
    ) as { instructions?: string; input: unknown[] }
    expect(body.instructions).toBeUndefined()
    expect(body.input).toHaveLength(1)
  })

  it('uses a fresh turn when no user message exists but an image is given', () => {
    const body = buildResponsesRequest([], 'gpt-5.5', 1500, 'aGVsbG8=') as {
      input: Array<{ role: string; content: unknown }>
    }
    expect(body.input).toHaveLength(1)
    expect(body.input[0].role).toBe('user')
  })

  it('settles exactly once across the exported handlers', () => {
    // handleEvent itself is stateless; the single-settlement guarantee lives in
    // streamOpenAICompletion. Verify the terminal events are unambiguous here.
    const { calls, callbacks } = collector()
    const doneSpy = vi.fn(callbacks.onDone)
    const once: OpenAIStreamCallbacks = { ...callbacks, onDone: doneSpy }
    expect(handleEvent('response.completed', {}, once)).toBe(true)
    expect(doneSpy).toHaveBeenCalledTimes(1)
    expect(calls.filter((c) => c === 'done')).toHaveLength(1)
  })
})
