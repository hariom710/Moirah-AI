import { describe, it, expect } from 'vitest'
import {
  INITIAL_GUARD_STATE,
  isMeetingTitle,
  nextGuardAction,
  type GuardState
} from '../src/shared/meeting-guard-core'

// Walk a sequence of poll ticks through the pure state machine.
function runTicks(start: GuardState, inputs: Parameters<typeof nextGuardAction>[1][]): GuardState {
  let state = start
  for (const input of inputs) state = nextGuardAction(state, input).state
  return state
}

describe('isMeetingTitle — window titles', () => {
  it.each([
    'Zoom Meeting',
    'Zoom Workplace',
    "Hariom's Zoom Meeting",
    'Zoom | Hariom Balang',
    'Zoom meeting with Hariom',
    'Microsoft Teams',
    'Teams | Hariom Balang',
    'Hariom Balang | Teams',
    'Hariom Balang - Google Meet - Google Chrome',
    'Google Meet',
    'Cisco Webex Meetings',
    'BlueJeans Meeting',
    'GoToMeeting',
    'Go To Webinar',
    'Whereby - Hariom',
    'Jitsi Meet',
    'Skype'
  ])('detects %s as a meeting', (title) => {
    expect(isMeetingTitle(title)).toBe(true)
  })

  it.each([
    'Moirah AI — Dashboard',
    'Visual Studio Code',
    'Infinite Zoom — Wikipedia', // bare "Zoom" word in an unrelated page title
    'Slack | hariom710', // chat app, deliberately excluded
    'Discord',
    'Notepad',
    ''
  ])('does NOT detect %s as a meeting', (title) => {
    expect(isMeetingTitle(title)).toBe(false)
  })
})

describe('isMeetingTitle — macOS frontmost app names', () => {
  // macOS returns the app NAME, not a tab title, so exact app names must match.
  it.each(['zoom.us', 'Zoom', 'Microsoft Teams', 'Teams', 'Webex', 'Skype', 'GoToMeeting', 'Whereby'])(
    'detects app %s',
    (app) => {
      expect(isMeetingTitle(app)).toBe(true)
    }
  )

  it('does NOT detect Chrome as a meeting (known macOS limitation)', () => {
    // A Google Meet call inside Chrome reports "Google Chrome" — the heuristic
    // cannot see the tab title, so this is a documented false negative.
    expect(isMeetingTitle('Google Chrome')).toBe(false)
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(isMeetingTitle('  ZOOM.MEETING  ')).toBe(true)
    expect(isMeetingTitle('  ')).toBe(false)
  })
})

describe('nextGuardAction — hiding', () => {
  it('hides the overlay when a meeting app first gains focus', () => {
    const out = nextGuardAction(INITIAL_GUARD_STATE, {
      enabled: true,
      title: 'Zoom Meeting',
      overlayVisible: true
    })
    expect(out.action).toBe('hide')
    expect(out.state).toEqual({ prevMeeting: true, hiddenByGuard: true })
  })

  it('does not re-hide on every poll while the meeting stays focused', () => {
    // Second tick: prevMeeting already true -> edge-triggered, no repeat hide.
    const state = runTicks(INITIAL_GUARD_STATE, [
      { enabled: true, title: 'Zoom Meeting', overlayVisible: true }
    ])
    const out = nextGuardAction(state, {
      enabled: true,
      title: 'Zoom Meeting',
      overlayVisible: false
    })
    expect(out.action).toBe('none')
  })

  it('does not claim credit for an overlay the user already hid', () => {
    const out = nextGuardAction(INITIAL_GUARD_STATE, {
      enabled: true,
      title: 'Microsoft Teams',
      overlayVisible: false
    })
    expect(out.action).toBe('none')
    expect(out.state.hiddenByGuard).toBe(false) // we did NOT hide it
  })
})

describe('nextGuardAction — sticky restore (exposure-race regression)', () => {
  it('keeps the overlay hidden when the meeting window loses focus', () => {
    // The core safety fix: focus flickering away from the meeting must NOT
    // pop the overlay back while screen sharing may still be active.
    const state = runTicks(INITIAL_GUARD_STATE, [
      { enabled: true, title: 'Zoom Meeting', overlayVisible: true }, // hide
      { enabled: true, title: 'Visual Studio Code', overlayVisible: false } // meeting lost focus
    ])
    const out = nextGuardAction(state, {
      enabled: true,
      title: 'Visual Studio Code',
      overlayVisible: false
    })
    expect(out.action).toBe('none')
    expect(out.state.hiddenByGuard).toBe(true) // still held by the guard
  })

  it('keeps it hidden across many non-meeting polls', () => {
    const inputs = [
      { enabled: true, title: 'Zoom Meeting', overlayVisible: true },
      ...Array.from({ length: 10 }, () => ({
        enabled: true,
        title: 'Notepad',
        overlayVisible: false
      }))
    ]
    const state = runTicks(INITIAL_GUARD_STATE, inputs)
    expect(state.hiddenByGuard).toBe(true)
  })

  it('stays hidden even when the user switches back to the meeting later', () => {
    const state = runTicks(INITIAL_GUARD_STATE, [
      { enabled: true, title: 'Zoom Meeting', overlayVisible: true }, // hide
      { enabled: true, title: 'Notepad', overlayVisible: false }, // flicker away
      { enabled: true, title: 'Zoom Meeting', overlayVisible: false } // back to meeting
    ])
    expect(state.hiddenByGuard).toBe(true)
  })
})

describe('nextGuardAction — manual re-show is honored', () => {
  it('releases the guard once the user shows the overlay again', () => {
    const hidden = runTicks(INITIAL_GUARD_STATE, [
      { enabled: true, title: 'Zoom Meeting', overlayVisible: true }
    ])
    expect(hidden.hiddenByGuard).toBe(true)

    // User presses the toggle hotkey mid-meeting -> overlay visible again.
    const out = nextGuardAction(hidden, {
      enabled: true,
      title: 'Zoom Meeting',
      overlayVisible: true
    })
    expect(out.action).toBe('none') // no fighting the user
    expect(out.state.hiddenByGuard).toBe(false) // guard released
  })

  it('does not immediately re-hide after a manual re-show (no fighting)', () => {
    const state = runTicks(INITIAL_GUARD_STATE, [
      { enabled: true, title: 'Zoom Meeting', overlayVisible: true }, // hide
      { enabled: true, title: 'Zoom Meeting', overlayVisible: true } // user re-shows
    ])
    expect(state.hiddenByGuard).toBe(false)
  })
})

describe('nextGuardAction — setting disabled', () => {
  it('restores an overlay the guard had hidden when the feature is turned off', () => {
    const hidden = runTicks(INITIAL_GUARD_STATE, [
      { enabled: true, title: 'Zoom Meeting', overlayVisible: true }
    ])
    const out = nextGuardAction(hidden, { enabled: false, title: 'Zoom Meeting', overlayVisible: false })
    expect(out.action).toBe('restore')
    expect(out.state).toEqual(INITIAL_GUARD_STATE)
  })

  it('does nothing when disabled and nothing was hidden', () => {
    const out = nextGuardAction(INITIAL_GUARD_STATE, {
      enabled: false,
      title: 'Zoom Meeting',
      overlayVisible: true
    })
    expect(out.action).toBe('none')
  })

  it('never restores an overlay that is already visible', () => {
    const state: GuardState = { prevMeeting: true, hiddenByGuard: false }
    const out = nextGuardAction(state, { enabled: false, title: 'Notepad', overlayVisible: true })
    expect(out.action).toBe('none')
  })
})

describe('nextGuardAction — detection unavailable (Linux / FFI failure)', () => {
  it('changes nothing and preserves state when title is null', () => {
    const hidden = runTicks(INITIAL_GUARD_STATE, [
      { enabled: true, title: 'Zoom Meeting', overlayVisible: true }
    ])
    const out = nextGuardAction(hidden, { enabled: true, title: null, overlayVisible: false })
    expect(out.action).toBe('none')
    expect(out.state.hiddenByGuard).toBe(true) // sticky hold survives a null poll
  })

  it('never hides when detection returns null', () => {
    const out = nextGuardAction(INITIAL_GUARD_STATE, {
      enabled: true,
      title: null,
      overlayVisible: true
    })
    expect(out.action).toBe('none')
  })
})
