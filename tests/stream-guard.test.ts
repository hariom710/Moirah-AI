import { describe, it, expect } from 'vitest'
import { isCurrentStreamEvent } from '../src/shared/stream-guard'

// Regression coverage for the stale-stream isolation requirement: AI responses
// arrive as many chunk events + a terminal done/error event, each tagged with
// the requestId of the request that produced it. When a second question starts
// while the first is still streaming, events from the abandoned request keep
// arriving and MUST be dropped or the old answer bleeds into the new one.
describe('isCurrentStreamEvent — stale AI stream rejection', () => {
  const ACTIVE = 'req-2'

  it('ACCEPTS an event whose requestId matches the active request', () => {
    expect(isCurrentStreamEvent('req-2', ACTIVE)).toBe(true)
  })

  it('REJECTS a chunk from a previous/cancelled request', () => {
    // req-1 was superseded by req-2 mid-flight.
    expect(isCurrentStreamEvent('req-1', ACTIVE)).toBe(false)
  })

  it('REJECTS a stale terminal done event', () => {
    // The old request's done event must not finalize the new stream.
    expect(isCurrentStreamEvent('req-1', ACTIVE)).toBe(false)
    expect(isCurrentStreamEvent('req-0', ACTIVE)).toBe(false)
  })

  it('REJECTS a stale error event (old failure must not abort the new request)', () => {
    expect(isCurrentStreamEvent('old-error-id', ACTIVE)).toBe(false)
  })

  it('REJECTS everything when no request is active', () => {
    // activeRequestId is cleared after a stream completes — late chunks from a
    // just-finished request can never resurrect streaming UI.
    expect(isCurrentStreamEvent('req-1', '')).toBe(false)
    expect(isCurrentStreamEvent('', '')).toBe(false)
    expect(isCurrentStreamEvent('any-id', '')).toBe(false)
  })

  it('REJECTS an empty incoming id against an active request', () => {
    expect(isCurrentStreamEvent('', ACTIVE)).toBe(false)
  })

  it('REJECTS an event with no requestId field (undefined from a malformed send)', () => {
    // Production never sends this, but a missing id must fail closed rather
    // than compare loosely against the active id.
    expect(isCurrentStreamEvent(undefined as unknown as string, ACTIVE)).toBe(false)
  })

  it('is symmetric on match — a full old-vs-new interleaving drops every stale event', () => {
    // Simulate: request A is streaming, user asks a second question (B
    // becomes active mid-flight), then A's tail + terminal events arrive.
    let active = 'A'
    const accepted: string[] = []
    const push = (id: string, label: string) => {
      if (isCurrentStreamEvent(id, active)) accepted.push(label)
    }

    push('A', 'hel') // A is active — accepted
    active = 'B' // doSubmit swaps the active requestId here
    push('A', 'lo') // A's stale tail — dropped
    push('A', 'done') // A's stale terminal — dropped
    push('B', 'new-q') // B's stream — accepted
    push('B', 'new-a')

    // A's late events never bleed into B's answer.
    expect(accepted).toEqual(['hel', 'new-q', 'new-a'])
    expect(accepted).not.toContain('lo')
    expect(accepted).not.toContain('done')
  })
})
