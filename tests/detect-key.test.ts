import { describe, it, expect } from 'vitest'
import { detectApiKeyType } from '../src/shared/detect-key'

describe('detectApiKeyType', () => {
  it('detects OpenRouter keys by sk-or- prefix', () => {
    expect(detectApiKeyType('sk-or-v1-abc123def456')).toBe('openrouter')
  })

  it('detects OpenAI project keys by sk-proj- prefix', () => {
    expect(detectApiKeyType('sk-proj-abcdef123456')).toBe('openai')
  })

  it('detects legacy OpenAI keys (sk- followed by long token)', () => {
    expect(detectApiKeyType('sk-abc123def456ghi789jkl012')).toBe('openai')
  })

  it('detects OpenAI service-account keys', () => {
    expect(detectApiKeyType('sk-svcacct-abc123')).toBe('openai')
  })

  it('trims whitespace before detecting', () => {
    expect(detectApiKeyType('  sk-or-v1-xyz  ')).toBe('openrouter')
  })

  it('detects Gemini keys by AIza prefix', () => {
    expect(detectApiKeyType('AIza' + 'a'.repeat(33))).toBe('gemini')
  })

  it('does not misclassify short AIza fragments as Gemini', () => {
    expect(detectApiKeyType('AIza-short')).toBe('unknown')
  })

  it('returns unknown for garbage input', () => {
    expect(detectApiKeyType('hello world')).toBe('unknown')
    expect(detectApiKeyType('')).toBe('unknown')
    expect(detectApiKeyType('sk-short')).toBe('unknown')
  })

  it('returns unknown for other providers like Anthropic', () => {
    expect(detectApiKeyType('sk-ant-api03-abc123def456ghi789')).toBe('unknown')
  })

  it('prefers the OpenRouter prefix over the legacy pattern', () => {
    expect(detectApiKeyType('sk-or-v1-' + 'a'.repeat(30))).toBe('openrouter')
  })
})
