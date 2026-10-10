// meeting-guard-core.ts — pure decision logic for the meeting auto-hide
// heuristic. Deliberately free of Electron/Node imports so it can be unit
// tested directly (see tests/meeting-guard.test.ts).
//
// IMPORTANT: This is NOT true screen-share detection. It matches the
// foreground window title / app name against known meeting apps and hides the
// overlay when one moves into focus. It can miss shares from unrecognized
// apps and can match unrelated windows. The panic-hide hotkey (Ctrl+Shift+H)
// remains the reliable escape hatch.

// Matched against the lowercased foreground *window title*. Word-bounded so
// substrings don't match ("zoomable", "skypeless"). Deliberately excludes
// chat apps (Slack, Discord) whose ordinary windows would false-positive.
//
// False positives are the safe direction here: the worst case is the overlay
// hiding when it did not need to, which the user reverses with one hotkey.
// A false negative (overlay left visible in a real meeting) is the dangerous
// case, so we keep the list broad.
export const MEETING_TITLE_PATTERNS: RegExp[] = [
  // Zoom needs meeting context, not just the bare word: "Infinite Zoom —
  // Wikipedia" and similar page titles must not trigger a hide.
  /zoom (meeting|workplace|webinar|conference)/, // "Zoom Meeting", "Zoom Workplace"
  /^zoom(\s|[-|])/, // title starts with "Zoom " / "Zoom -" / "Zoom |"
  /\bzoom\b.*\b(meeting|conference|call|webinar)\b/, // "Hariom's Zoom Meeting"
  /\b(meeting|conference|call|webinar)\b.*\bzoom\b/, // "Zoom meeting with Hariom"
  /\bmicrosoft teams\b/, // Teams (work or school)
  /^teams \|/, // legacy Teams title format
  /\| teams$/, // Teams window suffix
  /\bgoogle meet\b/, // Meet tab/window title
  /(^|\s)- meet -/, // Chrome/Edge tab title middle segment
  /\bwebex\b/, // Cisco Webex
  /\bbluejeans\b/,
  /\bgotomeeting\b/,
  /\bgo to webinar\b/,
  /\bwhereby\b/,
  /\bjitsi\b/,
  /^skype$/, // standalone Skype window
  /\bskype for business\b/
]

// Matched against the macOS frontmost *application name* (osascript returns
// the app name, not a window/tab title — so a Google Meet call inside Chrome
// reports "Google Chrome" and cannot be matched here; that limitation is
// documented in foreground.ts and the README).
export const MEETING_APP_NAME_PATTERNS: RegExp[] = [
  /^zoom(\.us)?$/, // Zoom desktop app
  /^microsoft teams$/,
  /^teams$/,
  /^webex$/,
  /^skype$/,
  /^gotomeeting$/,
  /^whereby$/
]

const ALL_PATTERNS = [...MEETING_TITLE_PATTERNS, ...MEETING_APP_NAME_PATTERNS]

/** True when a foreground window title or macOS app name looks like a meeting app. */
export function isMeetingTitle(title: string): boolean {
  const lower = title.toLowerCase().trim()
  if (!lower) return false
  return ALL_PATTERNS.some((re) => re.test(lower))
}

export interface GuardState {
  /** Whether the previous poll saw a meeting app in the foreground. */
  prevMeeting: boolean
  /** Whether *this guard* is the reason the overlay is currently hidden. */
  hiddenByGuard: boolean
}

export const INITIAL_GUARD_STATE: GuardState = { prevMeeting: false, hiddenByGuard: false }

export interface GuardInput {
  enabled: boolean
  /** Foreground title/app name, or null when detection is unavailable. */
  title: string | null
  overlayVisible: boolean
}

export type GuardAction = 'hide' | 'restore' | 'none'

export interface GuardOutcome {
  action: GuardAction
  state: GuardState
}

/**
 * Pure, edge-triggered state machine for one poll tick.
 *
 * Safety posture: once the guard hides the overlay it STAYS hidden. It is
 * never auto-restored merely because the meeting window lost focus — that is
 * the accidental-exposure race (focus flickers away for one poll and the
 * overlay pops back while still being shared). The overlay only returns via
 * an explicit user action (hotkey/tray) or when the feature is switched off.
 */
export function nextGuardAction(state: GuardState, input: GuardInput): GuardOutcome {
  const { enabled, title, overlayVisible } = input

  // A visible overlay means the user already re-showed it. Never fight them:
  // drop the guard flag and treat this as a fresh observation.
  const guardActive = overlayVisible ? false : state.hiddenByGuard

  // Feature switched off while we had it hidden — hand the overlay back.
  if (!enabled) {
    return {
      action: !overlayVisible && guardActive ? 'restore' : 'none',
      state: { prevMeeting: false, hiddenByGuard: false }
    }
  }

  // Detection unavailable (Linux, or FFI/osascript failure) — change nothing.
  if (title === null) {
    return { action: 'none', state: { prevMeeting: state.prevMeeting, hiddenByGuard: guardActive } }
  }

  const isMeeting = isMeetingTitle(title)

  if (isMeeting && !state.prevMeeting) {
    // Meeting app just gained focus — hide once, only if currently visible.
    return {
      action: overlayVisible ? 'hide' : 'none',
      state: { prevMeeting: true, hiddenByGuard: overlayVisible ? true : guardActive }
    }
  }

  // Meeting gained more focus, or no meeting at all: do nothing and keep the
  // overlay hidden (sticky). Restore is never automatic here.
  return { action: 'none', state: { prevMeeting: isMeeting, hiddenByGuard: guardActive } }
}
