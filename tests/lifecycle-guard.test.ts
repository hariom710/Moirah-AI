import { describe, it, expect } from 'vitest'
import { createLifecycleGuard } from '../src/shared/meeting-guard-core'

// Regression coverage for the stale meeting-guard tick requirement: a tick
// that awaits foreground detection can still be suspended when the guard is
// stopped or restarted. The synchronous `ticking` flag cannot catch that (it
// is cleared while the tick is suspended), so a resumed tick must be able to
// recognise itself as stale and decline to apply state.
describe('createLifecycleGuard — stale tick rejection', () => {
  it('issues a token on start and reports it current', () => {
    const g = createLifecycleGuard()
    const t = g.start()
    expect(g.isCurrent(t)).toBe(true)
    expect(g.isStale(t)).toBe(false)
  })

  it('stales the outstanding token when the guard is stopped', () => {
    const g = createLifecycleGuard()
    const t = g.start()
    g.stop()
    expect(g.isStale(t)).toBe(true)
    expect(g.isCurrent(t)).toBe(false)
  })

  it('stales the outstanding token across a restart', () => {
    const g = createLifecycleGuard()
    const first = g.start()
    g.stop()
    const second = g.start()
    // A tick from the first incarnation must not apply after restart.
    expect(g.isStale(first)).toBe(true)
    expect(g.isCurrent(second)).toBe(true)
    expect(first).not.toBe(second)
  })

  it('issues a fresh, distinct token on every start', () => {
    const g = createLifecycleGuard()
    const tokens = [g.start(), g.start(), g.start()]
    expect(new Set(tokens).size).toBe(tokens.length)
    // Only the most recent incarnation is current.
    expect(g.isCurrent(tokens[2])).toBe(true)
    expect(g.isCurrent(tokens[0])).toBe(false)
    expect(g.isCurrent(tokens[1])).toBe(false)
  })

  it('stop() before any start() leaves nothing current (fail closed)', () => {
    const g = createLifecycleGuard()
    g.stop()
    expect(g.isCurrent(1)).toBe(false)
    expect(g.isStale(1)).toBe(true)
  })

  it('models the real in-flight tick scenario end to end', () => {
    const g = createLifecycleGuard()

    // Guard starts; tick begins and captures its token, then awaits.
    const gen = g.start()

    // While suspended, the guard is stopped (app quit / overlay torn down).
    g.stop()

    // The tick resumes and checks before applying state.
    expect(g.isStale(gen)).toBe(true) // -> must return without hiding/restoring

    // A restart yields a new incarnation that old ticks cannot touch.
    const newGen = g.start()
    expect(g.isStale(gen)).toBe(true)
    expect(g.isCurrent(newGen)).toBe(true)
  })
})
