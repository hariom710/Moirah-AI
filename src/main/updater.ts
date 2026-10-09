// Auto-updater — checks GitHub Releases (via electron-updater) using the
// publish config already declared in package.json (provider: github).
// Downloads silently; the overlay shows a restart toast when ready.
// Checks never interrupt usage — install happens only on explicit user action.
import { ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getOverlayWindow } from './overlay-window'

const INITIAL_CHECK_DELAY_MS = 10_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours

let initialized = false

export function initUpdater(): void {
  if (initialized) return
  initialized = true

  // Never check for updates in dev
  if (is.dev) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Avoids differential-download issues (unsigned delta patches)
  autoUpdater.disableDifferentialDownload = true

  autoUpdater.on('update-downloaded', (info) => {
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
        version: info.version,
        ready: true
      })
    }
  })

  // Errors are non-fatal: log and retry on the next scheduled check
  autoUpdater.on('error', (err) => {
    console.warn('[Moirah] Update check/download failed:', err.message)
  })

  ipcMain.on(IPC_CHANNELS.APP_INSTALL_UPDATE, () => {
    autoUpdater.quitAndInstall()
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.warn('[Moirah] Update check failed:', err.message)
    })
  }

  setTimeout(check, INITIAL_CHECK_DELAY_MS)
  setInterval(check, CHECK_INTERVAL_MS)
}
