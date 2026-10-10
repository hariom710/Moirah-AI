// meeting-guard.ts — best-effort "hide the overlay during a meeting" heuristic.
//
// IMPORTANT: This is NOT true screen-share detection. It polls the foreground
// window title every 2 seconds and hides the overlay when a known meeting app
// moves into the foreground (edge-triggered: once per meeting-focus entry).
// It can miss shares from other apps and can mis-trigger on unrelated windows
// whose title matches. The panic-hide hotkey remains the reliable escape hatch.
//
// Behavior:
//   - Meeting app gains focus while overlay is visible  -> overlay is hidden.
//   - User re-shows the overlay during the meeting      -> honored; no fighting.
//   - Meeting focus transitions do NOT auto re-show     -> fail closed.
//   - Setting toggled off while auto-hidden             -> overlay restored.
import { getSetting } from '../services/store'
import { getOverlayWindow, hideOverlay, showOverlay } from './overlay-window'
import { getForegroundWindowTitle } from './foreground'

const POLL_INTERVAL_MS = 2000

// Matched against the lowercased foreground window title / app name.
// Best-effort list of dedicated meeting apps — deliberately excludes chat
// apps (Slack, Discord) whose ordinary windows would false-positive.
export const MEETING_TITLE_PATTERNS: RegExp[] = [
  /zoom/, // Zoom Workplace / Zoom Meeting
  /microsoft teams/, // Teams (work or school)
  /^teams \|/, // legacy Teams title format
  /\| teams$/, // Teams window suffix
  /google meet/, // Meet tab/window title
  /(^|\s)- meet -/, // Chrome/Edge tab title middle segment
  /webex/, // Cisco Webex
  /bluejeans/,
  /gotomeeting/,
  /go to webinar/,
  /whereby/,
  /jitsi/,
  /skype/
]

export function isMeetingTitle(title: string): boolean {
  const lower = title.toLowerCase()
  return MEETING_TITLE_PATTERNS.some((re) => re.test(lower))
}

let timer: ReturnType<typeof setInterval> | null = null
let ticking = false
let prevMeeting: boolean | null = null
let hiddenByGuard = false

async function tick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed()) return

    const enabled = getSetting<boolean>('autoHideOnMeeting') === true
    if (!enabled) {
      // Feature turned off while we had it hidden — give it back.
      if (hiddenByGuard && !win.isVisible()) showOverlay()
      hiddenByGuard = false
      prevMeeting = null
      return
    }

    const title = await getForegroundWindowTitle()
    if (title === null) return // detection unavailable (Linux / FFI failure)

    const isMeeting = isMeetingTitle(title)

    if (isMeeting && prevMeeting !== true) {
      // Meeting app just gained focus — hide once.
      if (win.isVisible()) {
        hideOverlay()
        hiddenByGuard = true
      }
    } else if (!isMeeting && hiddenByGuard && win.isVisible()) {
      // User manually re-showed the overlay outside meeting focus; stop tracking
      // it as guard-hidden so we don't override future user intent.
      hiddenByGuard = false
    }
    prevMeeting = isMeeting
  } catch (err) {
    console.warn('[Moirah] meeting-guard tick failed:', err instanceof Error ? err.message : err)
  } finally {
    ticking = false
  }
}

export function startMeetingGuard(): void {
  if (timer) return
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
}

export function stopMeetingGuard(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (hiddenByGuard) {
    const win = getOverlayWindow()
    if (win && !win.isDestroyed() && !win.isVisible()) showOverlay()
    hiddenByGuard = false
  }
  prevMeeting = null
}
