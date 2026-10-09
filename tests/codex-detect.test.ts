import { describe, it, expect } from 'vitest'
import { parseCodexVersionOutput, checkCommandInstalled } from '../src/main/codex-detect'

describe('parseCodexVersionOutput', () => {
  it('accepts codex version strings like "codex-cli 0.1.2"', () => {
    expect(parseCodexVersionOutput('codex-cli 0.1.2')).toBe(true)
  })

  it('accepts "codex 1.2.3"', () => {
    expect(parseCodexVersionOutput('codex 1.2.3')).toBe(true)
  })

  it('ignores surrounding whitespace and newlines', () => {
    expect(parseCodexVersionOutput('\n  codex 0.9.0 \n')).toBe(true)
  })

  it('rejects error output', () => {
    expect(parseCodexVersionOutput('command not found')).toBe(false)
    expect(parseCodexVersionOutput('')).toBe(false)
    expect(parseCodexVersionOutput('some random output')).toBe(false)
  })

  it('rejects "notcodex 1.2" (word boundary)', () => {
    expect(parseCodexVersionOutput('notcodex 1.2.3')).toBe(false)
  })
})

describe('checkCommandInstalled', () => {
  it('resolves with installed=false for a nonexistent command', async () => {
    const status = await checkCommandInstalled('moirah-definitely-not-a-real-cmd-xyz')
    expect(status.installed).toBe(false)
    expect(typeof status.loggedInHint).toBe('boolean')
  }, 15000)
})
