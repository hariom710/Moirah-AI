// meeting-guard.ts — best-effort "hide the overlay during a meeting" heuristic.
//
// IMPORTANT: This is NOT true screen-share detection. It polls the foreground
// window title every 2 seconds and hides the overlay when a known meeting app
// moves into the foreground. It can miss shares from unrecognized apps and can
// match unrelated windows whose title matches. The panic-hide hotkey
// (Ctrl+Shift+H) remains the reliable escape hatch.
//
// All decision logic lives in ../shared/meeting-guard-core.ts (pure + unit
// tested). This file only wires it to Electron: the overlay window, the
// stored setting, and foreground detection.
//
// Behavior (see nextGuardAction for the exact state machine):
//   - Meeting app gains focus while overlay is visible -> overlay is hidden.
//   - Meeting window loses focus                       -> overlay STAYS hidden.
//     It is never auto-restored, because a momentary focus flicker while
//     still sharing would otherwise pop the overlay back on screen. The user
//     re-shows it explicitly (hotkey / tray) or by switching the setting off.
//   - User re-shows the overlay during the meeting     -> honored; guard released.
//   - Setting toggled off while auto-hidden            -> overlay restored.
import { getSetting } from '../services/store'
import { getOverlayWindow, hideOverlay, showOverlay } from './overlay-window'
import { getForegroundWindowTitle } from './foreground'
import {
  INITIAL_GUARD_STATE,
  MEETING_APP_NAME_PATTERNS,
  MEETING_TITLE_PATTERNS,
  isMeetingTitle,
  nextGuardAction,
  type GuardState
} from '../shared/meeting-guard-core'

export { isMeetingTitle, MEETING_APP_NAME_PATTERNS, MEETING_TITLE_PATTERNS }

const POLL_INTERVAL_MS = 2000

let timer: ReturnType<typeof setInterval> | null = null
let ticking = false
let state: GuardState = INITIAL_GUARD_STATE

async function tick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed()) return

    const outcome = nextGuardAction(state, {
      enabled: getSetting<boolean>('autoHideOnMeeting') === true,
      title: await getForegroundWindowTitle(),
      overlayVisible: win.isVisible()
    })
    state = outcome.state

    if (outcome.action === 'hide') hideOverlay()
    else if (outcome.action === 'restore') showOverlay()
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
  // Deliberately no auto-restore here either: this is teardown, and popping a
  // sensitive overlay back on screen as the guard shuts down is the exact
  // exposure we are avoiding. The next startMeetingGuard() begins fresh.
  state = INITIAL_GUARD_STATE
  ticking = false
}
