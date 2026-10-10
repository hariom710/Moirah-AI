// Onboarding window — first-run setup wizard.
// Framed, centered, normal window (mirrors dashboard-window.ts patterns).
// Registers its own IPC handlers because the wizard owns its lifecycle:
//   onboarding:complete     → mark onboarded (unless skipped), close, show overlay
//   onboarding:check-codex  → detect local Codex CLI install/login
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { setSetting } from '../services/store'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { showOverlay } from './overlay-window'
import { checkCodexInstalled } from './codex-detect'

let onboardingWindow: BrowserWindow | null = null
let handlersRegistered = false
let isQuitting = false
let codexCheckInFlight: Promise<{ installed: boolean; loggedInHint: boolean }> | null = null

function registerOnboardingHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true

  app.on('before-quit', () => {
    isQuitting = true
  })

  ipcMain.on(IPC_CHANNELS.ONBOARDING_COMPLETE, (_event, skipped: unknown) => {
    if (skipped !== true) {
      setSetting('onboardingComplete', true)
    }
    closeOnboardingWindow()
  })

  ipcMain.handle(IPC_CHANNELS.ONBOARDING_CHECK_CODEX, () => {
    if (!codexCheckInFlight) {
      codexCheckInFlight = checkCodexInstalled().finally(() => {
        codexCheckInFlight = null
      })
    }
    return codexCheckInFlight
  })
}

// Register eagerly at import time: this module is imported at app startup,
// so the IPC contract holds even if a renderer (e.g. the overlay or the
// dashboard) calls checkCodex()/completeOnboarding() before the wizard
// window has ever been created. createOnboardingWindow() keeps its call
// as a no-op safety net (guarded by handlersRegistered).
registerOnboardingHandlers()

export function createOnboardingWindow(): BrowserWindow {
  registerOnboardingHandlers()

  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus()
    return onboardingWindow
  }

  onboardingWindow = new BrowserWindow({
    width: 680,
    height: 560,
    minWidth: 680,
    minHeight: 560,
    title: 'Moirah AI — Welcome',
    frame: true,
    resizable: false,
    center: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false // Required: @electron-toolkit/preload uses Node APIs in preload
    }
  })

  // Whatever way the window closes (Finish, Skip, or the titlebar X),
  // make sure the user is never stranded: show the overlay. The Finish
  // path sets onboardingComplete=true first, so re-running the wizard
  // stays possible from the tray for skipped users.
  onboardingWindow.on('closed', () => {
    onboardingWindow = null
    if (!isQuitting) {
      showOverlay()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    onboardingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/onboarding/index.html`)
  } else {
    onboardingWindow.loadFile(path.join(__dirname, '../renderer/onboarding/index.html'))
  }

  // --- Security: block navigation and new windows (same policy as dashboard) ---
  onboardingWindow.webContents.on('will-navigate', (event, url) => {
    if (is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) {
      return
    }
    console.warn('[Moirah] Blocked onboarding navigation to:', url)
    event.preventDefault()
  })

  onboardingWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url).catch(() => {})
    }
    return { action: 'deny' }
  })

  return onboardingWindow
}

export function closeOnboardingWindow(): void {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    // 'closed' handler shows the overlay
    onboardingWindow.close()
  }
}

export function getOnboardingWindow(): BrowserWindow | null {
  return onboardingWindow
}
