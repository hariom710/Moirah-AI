import { describe, it, expect } from 'vitest'
import {
  processGeminiSseBlock,
  handleGeminiChunk,
  buildGeminiRequest,
  type GeminiStreamCallbacks
} from '../src/services/gemini-api'

function collector() {
  const chunks: string[] = []
  const calls: string[] = []
  const callbacks: GeminiStreamCallbacks = {
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

describe('Gemini SSE parsing', () => {
  it('extracts text from a candidates chunk', () => {
    const { chunks, callbacks } = collector()
    const terminal = processGeminiSseBlock(
      'data: {"candidates":[{"content":{"parts":[{"text":"hello"}],"role":"model"}}]}\n\n',
      callbacks
    )
    expect(terminal).toBe(false)
    expect(chunks).toEqual(['hello'])
  })

  it('concatenates multiple text parts in one chunk', () => {
    const { chunks, callbacks } = collector()
    handleGeminiChunk(
      { candidates: [{ content: { parts: [{ text: 'foo ' }, { text: 'bar' }] } }] },
      callbacks
    )
    expect(chunks).toEqual(['foo ', 'bar'])
  })

  it('surfaces an error payload as a terminal event', () => {
    const { calls, chunks, callbacks } = collector()
    const terminal = processGeminiSseBlock(
      'data: {"error":{"code":400,"message":"API key not valid"}}\n\n',
      callbacks
    )
    expect(terminal).toBe(true)
    expect(calls).toEqual(['error'])
    expect(chunks[0]).toContain('API key not valid')
  })

  it('reports a blocked prompt as an error', () => {
    const { calls, callbacks } = collector()
    handleGeminiChunk({ promptFeedback: { blockReason: 'SAFETY' } }, callbacks)
    expect(calls).toEqual(['error'])
  })

  it('ignores chunks without candidates', () => {
    const { calls, callbacks } = collector()
    handleGeminiChunk({ candidates: [] }, callbacks)
    handleGeminiChunk({ usageMetadata: { promptTokenCount: 5 } }, callbacks)
    expect(calls).toEqual([])
  })

  it('ignores garbage blocks without firing callbacks', () => {
    const { calls, callbacks } = collector()
    const terminal = processGeminiSseBlock('data: not-json{{\n\n', callbacks)
    expect(terminal).toBe(false)
    expect(calls).toEqual([])
  })

  it('ignores blocks with no data line', () => {
    const { calls, callbacks } = collector()
    expect(processGeminiSseBlock(': comment only\n\n', callbacks)).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('Gemini request building', () => {
  const messages = [
    { role: 'system' as const, content: 'Be concise.' },
    { role: 'user' as const, content: 'First question' },
    { role: 'assistant' as const, content: 'First answer' },
    { role: 'user' as const, content: 'Second question' }
  ]

  it('maps roles (assistant -> model) and puts the system prompt in systemInstruction', () => {
    const body = buildGeminiRequest(messages, 1500) as {
      systemInstruction: { parts: Array<{ text: string }> }
      contents: Array<{ role: string; parts: Array<{ text: string }> }>
      generationConfig: { maxOutputTokens: number }
    }
    expect(body.systemInstruction.parts[0].text).toBe('Be concise.')
    expect(body.generationConfig.maxOutputTokens).toBe(1500)
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
    expect(body.contents[0].parts[0].text).toBe('First question')
    expect(body.contents[1].parts[0].text).toBe('First answer')
  })

  it('attaches the screenshot as inlineData on the latest user turn', () => {
    const body = buildGeminiRequest(messages, 1500, 'aGVsbG8=') as {
      contents: Array<{ role: string; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>
    }
    const lastUser = body.contents[body.contents.length - 1]
    expect(lastUser.role).toBe('user')
    expect(lastUser.parts[0].text).toBe('Second question')
    expect(lastUser.parts[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: 'aGVsbG8=' })
    // Earlier turns stay text-only.
    expect(body.contents[0].parts).toHaveLength(1)
  })

  it('still produces a valid body without a system prompt', () => {
    const body = buildGeminiRequest([{ role: 'user' as const, content: 'Hi' }], 1500) as {
      systemInstruction?: unknown
      contents: unknown[]
    }
    expect(body.systemInstruction).toBeUndefined()
    expect(body.contents).toHaveLength(1)
  })

  it('uses a fresh turn when no user message exists but an image is given', () => {
    const body = buildGeminiRequest([], 1500, 'aGVsbG8=') as {
      contents: Array<{ role: string }>
    }
    expect(body.contents).toHaveLength(1)
    expect(body.contents[0].role).toBe('user')
  })
})
