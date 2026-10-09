// Moirah AI — Main process entry point
import { app, BrowserWindow, shell } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createOverlayWindow, getOverlayWindow, showOverlay } from './overlay-window'
import { createTray, destroyTray } from './tray'
import { registerHotkeys, unregisterAllHotkeys } from './hotkey-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { createOnboardingWindow, getOnboardingWindow } from './onboarding-window'
import { initUpdater } from './updater'
import { getSetting } from '../services/store'

// Catch unhandled errors globally — prevents crash from spawn ENOENT (e.g. missing sox)
process.on('uncaughtException', (err) => {
  console.error('[Moirah] Uncaught exception:', err.message)
  // Don't crash the app for non-fatal spawn errors
  if (err.message.includes('ENOENT') || err.message.includes('spawn')) {
    console.error('[Moirah] A required system binary is missing. Audio features may be unavailable.')
    return
  }
  // For truly fatal errors, still exit
  throw err
})

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// Help Windows desktop capture APIs enumerate screens reliably
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('enable-usermedia-screen-capturing')
}

app.whenReady().then(() => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.moirah.ai')

  // Watch for shortcut events in dev
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- Security: global navigation policy for all web contents ---
  // This is a catch-all; individual windows also have their own handlers.
  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event, url) => {
      // Allow dev server HMR reloads
      if (is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) {
        return
      }
      console.warn('[Moirah] Global policy blocked navigation to:', url)
      event.preventDefault()
    })

    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) {
        shell.openExternal(url).catch(() => {})
      }
      return { action: 'deny' }
    })
  })

  // Create the overlay window
  const overlay = createOverlayWindow()

  // Register IPC handlers
  registerIpcHandlers(overlay)

  // Register global hotkeys
  registerHotkeys(overlay)

  // NOTE: Screen share detector was removed — it was incorrectly hiding the overlay
  // whenever meeting apps (Zoom, Teams, Chrome) were simply running.
  // The overlay is already invisible to screen capture via setContentProtection(true)
  // on Windows and type:'panel' on macOS. No additional hiding is needed.

  // Create system tray
  createTray()

  // Auto-update checks (no-op in dev)
  initUpdater()

  // First run: show the onboarding wizard instead of the bare overlay.
  // The overlay is still created (tray/hotkeys depend on it) but hidden;
  // the wizard shows it when the user finishes or skips.
  // Escape hatch for upgraders from 1.3.x: if an API key or provider is
  // already configured, skip the wizard so configured users aren't forced
  // through setup again after upgrading to 1.4.0.
  const onboarded = getSetting<boolean>('onboardingComplete')
  const hasProviderConfig =
    !!getSetting<string>('openrouterApiKey') ||
    !!getSetting<string>('openaiApiKey') ||
    getSetting<'openrouter' | 'openai' | 'codex'>('aiProvider') === 'codex'
  if (!onboarded && !hasProviderConfig) {
    overlay.hide()
    createOnboardingWindow()
  }

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow()
    } else {
      const ov = getOverlayWindow()
      if (ov) showOverlay({ focus: true })
    }
  })
})

// Handle second instance — focus the setup wizard if it's open (a fresh
// install shouldn't get the overlay popped above it mid-setup), else show overlay
app.on('second-instance', () => {
  const wizard = getOnboardingWindow()
  if (wizard && !wizard.isDestroyed()) {
    wizard.focus()
    return
  }
  const overlay = getOverlayWindow()
  if (overlay) {
    showOverlay({ focus: true })
  }
})

// Cleanup on quit
app.on('will-quit', () => {
  unregisterAllHotkeys()
  destroyTray()
})

// Don't quit when all windows are closed (keep tray alive)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Windows/Linux, keep running in tray
    // Only quit via tray menu or app.quit()
  }
})
