// Moirah AI download site logic — ESM module, auto-initializes in the browser.
// Exports are consumed by vitest (tests/site-detect-os.test.ts).

const RELEASES_BASE = 'https://github.com/moirah-ai/moirah-ai/releases/latest/download/'

export const DOWNLOAD_URLS = {
  windows: {
    setup: RELEASES_BASE + 'moirah-setup.exe',
    portable: RELEASES_BASE + 'moirah-portable.exe'
  },
  macos: {
    arm64: RELEASES_BASE + 'moirah-mac-arm64.zip',
    x64: RELEASES_BASE + 'moirah-mac-x64.zip'
  },
  linux: {
    appimage: RELEASES_BASE + 'moirah-linux-x64.AppImage',
    deb: RELEASES_BASE + 'moirah-linux-x64.deb'
  }
}

export function detectOS(userAgent) {
  if (/Windows/i.test(userAgent)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macos'
  if (/Linux|X11/i.test(userAgent)) return 'linux'
  return 'windows'
}

export function isMobileLike(ua) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
}

// Sync legacy helper. macOS caveat: navigator.platform reports "MacIntel" even on
// Apple Silicon, so this returns x64 for macOS when high-entropy data is unavailable.
// Runtime code should use getBestDownloadUrl for accurate Apple Silicon detection.
export function primaryDownloadUrl(ua) {
  const os = detectOS(ua)
  if (os === 'macos') return DOWNLOAD_URLS.macos.x64
  if (os === 'linux') return DOWNLOAD_URLS.linux.appimage
  return DOWNLOAD_URLS.windows.setup
}

export async function getBestDownloadUrl(ua) {
  const os = detectOS(ua)
  if (os !== 'macos') return primaryDownloadUrl(ua)
  // macOS: ask for high-entropy architecture when available; navigator.platform
  // reports "MacIntel" even on Apple Silicon, so it cannot be trusted alone.
  try {
    const uaData = navigator.userAgentData
    if (uaData && typeof uaData.getHighEntropyValue === 'function') {
      const { architecture } = await uaData.getHighEntropyValue(['architecture'])
      if (architecture === 'arm') return DOWNLOAD_URLS.macos.arm64
      if (architecture) return DOWNLOAD_URLS.macos.x64
    }
  } catch {
    // fall through to platform heuristic
  }
  return /arm|aarch64/i.test(navigator.platform || '')
    ? DOWNLOAD_URLS.macos.arm64
    : DOWNLOAD_URLS.macos.x64
}

export async function initDownloadButton() {
  const btn = document.getElementById('download-primary')
  const label = document.getElementById('download-label')
  if (!btn || !label) return
  const ua = navigator.userAgent

  // Phones/tablets can't run the Electron app; route them to the releases page.
  if (isMobileLike(ua)) {
    btn.href = 'https://github.com/moirah-ai/moirah-ai/releases'
    label.textContent = 'Get Moirah AI on desktop'
    return
  }

  btn.href = await getBestDownloadUrl(ua)
  const os = detectOS(ua)
  label.textContent =
    os === 'macos' ? 'Download for Mac' : os === 'linux' ? 'Download for Linux' : 'Download for Windows'
}

if (typeof document !== 'undefined' && typeof navigator !== 'undefined') {
  const ready = document.readyState === 'loading'
  if (ready) {
    document.addEventListener('DOMContentLoaded', initDownloadButton)
  } else {
    initDownloadButton()
  }
}
