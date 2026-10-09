// foreground.ts — best-effort foreground window title detection.
//
// Windows: koffi FFI (GetForegroundWindow / GetWindowTextW) — sub-millisecond,
//          safe to poll every couple of seconds.
// macOS:   osascript via System Events (async, ~100ms) — returns the frontmost
//          application name, which is what the meeting heuristic matches on.
// Linux:   unsupported — returns null and callers degrade gracefully.
import { execFile } from 'node:child_process'

let user32: {
  GetForegroundWindow: () => unknown
  GetWindowTextW: (hwnd: unknown, buf: Buffer, maxChars: number) => number
} | null = null
let ffiFailed = false

function ensureFFI(): boolean {
  if (user32) return true
  if (ffiFailed || process.platform !== 'win32') return false

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi')
    const lib = koffi.load('user32.dll')

    // HWND GetForegroundWindow(void)
    const GetForegroundWindow = lib.func('GetForegroundWindow', 'void*', [])
    // int GetWindowTextW(HWND hWnd, LPWSTR lpString, int nMaxCount)
    const GetWindowTextW = lib.func('GetWindowTextW', 'int', ['void*', 'void*', 'int'])

    user32 = { GetForegroundWindow, GetWindowTextW }
    return true
  } catch (err) {
    console.warn('[Moirah] foreground: koffi unavailable:', err instanceof Error ? err.message : err)
    ffiFailed = true
    user32 = null
    return false
  }
}

/**
 * Foreground window title (Windows/macOS) or null when detection is
 * unavailable/failed. Never throws.
 */
export function getForegroundWindowTitle(): Promise<string | null> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      try {
        if (!ensureFFI()) return resolve(null)
        const hwnd = user32!.GetForegroundWindow()
        const buf = Buffer.alloc(512 * 2) // 512 UTF-16 code units
        const len = user32!.GetWindowTextW(hwnd, buf, 512)
        if (len <= 0) return resolve('')
        resolve(buf.toString('ucs2').replace(/\0+$/, ''))
      } catch {
        resolve(null)
      }
    })
  }

  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      const script =
        'tell application "System Events" to get name of first application process whose frontmost is true'
      execFile('osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => {
        if (err) return resolve(null)
        resolve(stdout.trim() || '')
      })
    })
  }

  return Promise.resolve(null)
}
