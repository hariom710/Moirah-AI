// Global hotkey registration for Moirah AI
import { globalShortcut, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getSetting } from '../services/store'
import { DEFAULT_HOTKEYS } from '../shared/constants'
import { showOverlay, toggleOverlay, hideOverlay, getOverlayWindow } from './overlay-window'

export function registerHotkeys(overlayWindow: BrowserWindow): void {
  // Kept for API stability with callers — handlers below resolve the live
  // overlay window dynamically so they survive the window being recreated.
  applyHotkeys()
}

function applyHotkeys(): void {
  // Unregister all first to avoid conflicts
  globalShortcut.unregisterAll()

  // Merge stored hotkeys over defaults so newly added hotkeys (e.g. panicHide)
  // work for existing installs whose stored object predates them.
  const hotkeys = { ...DEFAULT_HOTKEYS, ...(getSetting<typeof DEFAULT_HOTKEYS>('hotkeys') || {}) }
  const panicHide = (typeof hotkeys.panicHide === 'string' && hotkeys.panicHide.trim().length > 0)
    ? hotkeys.panicHide
    : DEFAULT_HOTKEYS.panicHide

  // Ctrl/Cmd + Enter: Ask AI based on current context
  try {
    globalShortcut.register(hotkeys.askAI, () => {
      const win = getOverlayWindow()
      if (win && !win.isDestroyed()) {
        showOverlay()
        win.webContents.send(IPC_CHANNELS.HOTKEY_ASK_AI)
      }
    })
  } catch (e) {
    console.warn('[Moirah] Failed to register askAI hotkey:', e)
  }

  // Ctrl/Cmd + Shift + Enter: Ask AI with screenshot
  try {
    globalShortcut.register(hotkeys.screenshotAsk, () => {
      const win = getOverlayWindow()
      if (win && !win.isDestroyed()) {
        showOverlay()
        win.webContents.send(IPC_CHANNELS.HOTKEY_ASK_WITH_SCREENSHOT)
      }
    })
  } catch (e) {
    console.warn('[Moirah] Failed to register screenshotAsk hotkey:', e)
  }

  // Ctrl/Cmd + \: Toggle overlay visibility
  try {
    globalShortcut.register(hotkeys.toggleOverlay, () => {
      toggleOverlay()
    })
  } catch (e) {
    console.warn('[Moirah] Failed to register toggleOverlay hotkey:', e)
  }

  // Ctrl/Cmd + Shift + Space: Toggle audio recording
  try {
    globalShortcut.register(hotkeys.toggleAudio, () => {
      const win = getOverlayWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.HOTKEY_TOGGLE_AUDIO)
      }
    })
  } catch (e) {
    console.warn('[Moirah] Failed to register toggleAudio hotkey:', e)
  }

  // Ctrl/Cmd + Shift + H: Panic hide — instantly hide the overlay (screen-share safety)
  try {
    globalShortcut.register(panicHide, () => {
      hideOverlay()
    })
  } catch (e) {
    console.warn('[Moirah] Failed to register panicHide hotkey:', e)
  }
}

export function reRegisterHotkeys(): void {
  applyHotkeys()
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
}
