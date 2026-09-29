// Screen capture + OCR pipeline
// Primary capture uses Electron's desktopCapturer (works in packaged .exe).
// screenshot-desktop is a fallback — it depends on unpacked Windows binaries
// and often fails inside an asar archive.
import { Worker } from 'worker_threads'
import { join } from 'path'
import { execSync } from 'child_process'
import { desktopCapturer, nativeImage, screen } from 'electron'
import type { ScreenCaptureResult } from '../shared/types'
import { getOverlayWindow, showOverlay } from './overlay-window'

let isCapturing = false

interface OCRResponse {
  success: boolean
  text?: string
  error?: string
}

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  title: string
}

/**
 * Run OCR on an image buffer in a worker thread (12s timeout).
 * Exported so the AI query path can OCR user-attached screenshots too.
 */
export function ocrInWorker(imageBuffer: Buffer, language = 'eng'): Promise<string> {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, 'ocr-worker.js')
    const worker = new Worker(workerPath, {
      workerData: {
        imageBuffer: Buffer.from(imageBuffer),
        language
      }
    })

    worker.on('message', (result: OCRResponse) => {
      if (result.success) {
        resolve(result.text || '')
      } else {
        reject(new Error(result.error || 'OCR failed'))
      }
      worker.terminate()
    })

    worker.on('error', (err) => {
      reject(err)
      worker.terminate()
    })

    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error('OCR timed out after 12 seconds'))
    }, 12_000)

    worker.on('exit', () => {
      clearTimeout(timeout)
    })
  })
}

function hideOverlayForCapture(): boolean {
  const overlay = getOverlayWindow()
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) {
    overlay.hide()
    return true
  }
  return false
}

function restoreOverlay(): void {
  showOverlay()
}

function waitForRepaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 180))
}

async function captureViaDesktopCapturer(): Promise<Buffer> {
  const primary = screen.getPrimaryDisplay()
  const width = Math.max(1, Math.round(primary.size.width * primary.scaleFactor))
  const height = Math.max(1, Math.round(primary.size.height * primary.scaleFactor))

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
    fetchWindowIcons: false
  })

  if (!sources.length) {
    throw new Error('No screen sources found')
  }

  const match =
    sources.find((source) => source.display_id === String(primary.id)) ||
    sources.find((source) => source.id.startsWith('screen:')) ||
    sources[0]

  if (!match.thumbnail || match.thumbnail.isEmpty()) {
    throw new Error('Screen thumbnail was empty')
  }

  const png = match.thumbnail.toPNG()
  if (!png || png.length < 100) {
    throw new Error('Screen PNG was empty')
  }

  return png
}

async function captureViaScreenshotDesktop(): Promise<Buffer> {
  // Lazy-require so a missing/broken binary does not crash app startup
  const screenshot = require('screenshot-desktop') as (options?: { format?: 'png' | 'jpg' }) => Promise<Buffer>
  const imgBuffer = await screenshot({ format: 'png' })
  if (!imgBuffer || imgBuffer.length < 100) {
    throw new Error('screenshot-desktop returned an empty image')
  }
  return imgBuffer
}

async function grabScreenPng(): Promise<Buffer> {
  const errors: string[] = []

  try {
    return await captureViaDesktopCapturer()
  } catch (err) {
    errors.push(`desktopCapturer: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    return await captureViaScreenshotDesktop()
  } catch (err) {
    errors.push(`screenshot-desktop: ${err instanceof Error ? err.message : String(err)}`)
  }

  throw new Error(`Screen capture failed. ${errors.join(' | ')}`)
}

function getActiveWindowBounds(): WindowBounds | null {
  try {
    if (process.platform === 'win32') {
      const script = `
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WinAPI {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
          [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
          public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
          [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        }
"@
        $hwnd = [WinAPI]::GetForegroundWindow()
        $rect = New-Object WinAPI+RECT
        [WinAPI]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
        $sb = New-Object System.Text.StringBuilder 256
        [WinAPI]::GetWindowText($hwnd, $sb, 256) | Out-Null
        "$($rect.Left)|$($rect.Top)|$($rect.Right - $rect.Left)|$($rect.Bottom - $rect.Top)|$($sb.ToString())"
      `.trim()

      const result = execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
        timeout: 3000,
        encoding: 'utf-8',
        windowsHide: true
      }).trim()

      const parts = result.split('|')
      if (parts.length >= 4) {
        const x = parseInt(parts[0], 10)
        const y = parseInt(parts[1], 10)
        const width = parseInt(parts[2], 10)
        const height = parseInt(parts[3], 10)
        const title = parts.slice(4).join('|')

        if (width > 50 && height > 50) {
          return { x, y, width, height, title }
        }
      }
    } else if (process.platform === 'darwin') {
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          tell frontApp
            set {x, y} to position of front window
            set {w, h} to size of front window
          end tell
          return (x as text) & "|" & (y as text) & "|" & (w as text) & "|" & (h as text) & "|" & appName
        end tell
      `.trim()

      const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
        timeout: 3000,
        encoding: 'utf-8'
      }).trim()

      const parts = result.split('|')
      if (parts.length >= 4) {
        const x = parseInt(parts[0], 10)
        const y = parseInt(parts[1], 10)
        const width = parseInt(parts[2], 10)
        const height = parseInt(parts[3], 10)
        const title = parts.slice(4).join('|')

        if (width > 50 && height > 50) {
          return { x, y, width, height, title }
        }
      }
    } else if (process.platform === 'linux') {
      const windowId = execSync('xdotool getactivewindow', {
        timeout: 2000,
        encoding: 'utf-8'
      }).trim()

      const info = execSync(`xwininfo -id ${windowId}`, {
        timeout: 2000,
        encoding: 'utf-8'
      })

      const xMatch = info.match(/Absolute upper-left X:\s+(\d+)/)
      const yMatch = info.match(/Absolute upper-left Y:\s+(\d+)/)
      const wMatch = info.match(/Width:\s+(\d+)/)
      const hMatch = info.match(/Height:\s+(\d+)/)

      const titleResult = execSync(`xdotool getactivewindow getwindowname`, {
        timeout: 2000,
        encoding: 'utf-8'
      }).trim()

      if (xMatch && yMatch && wMatch && hMatch) {
        const x = parseInt(xMatch[1], 10)
        const y = parseInt(yMatch[1], 10)
        const width = parseInt(wMatch[1], 10)
        const height = parseInt(hMatch[1], 10)

        if (width > 50 && height > 50) {
          return { x, y, width, height, title: titleResult }
        }
      }
    }
  } catch (err) {
    console.warn('[Specter] Active window detection failed (will use full screen):', err)
  }

  return null
}

function cropImageBuffer(
  imgBuffer: Buffer,
  bounds: WindowBounds,
  displayBounds: { x: number; y: number; width: number; height: number }
): Buffer {
  try {
    const img = nativeImage.createFromBuffer(imgBuffer)
    if (img.isEmpty()) return imgBuffer

    const { width: imgWidth, height: imgHeight } = img.getSize()
    const scaleX = imgWidth / Math.max(1, displayBounds.width)
    const scaleY = imgHeight / Math.max(1, displayBounds.height)

    let cropX = Math.round((bounds.x - displayBounds.x) * scaleX)
    let cropY = Math.round((bounds.y - displayBounds.y) * scaleY)
    let cropW = Math.round(bounds.width * scaleX)
    let cropH = Math.round(bounds.height * scaleY)

    cropX = Math.max(0, cropX)
    cropY = Math.max(0, cropY)
    cropW = Math.min(cropW, imgWidth - cropX)
    cropH = Math.min(cropH, imgHeight - cropY)

    if (cropW < 50 || cropH < 50) {
      console.warn('[Specter] Crop area too small, using full screenshot')
      return imgBuffer
    }

    return img.crop({ x: cropX, y: cropY, width: cropW, height: cropH }).toPNG()
  } catch (err) {
    console.warn('[Specter] Image cropping failed, using full screenshot:', err)
    return imgBuffer
  }
}

function toJpegBase64(pngBuffer: Buffer, maxWidth = 1600, quality = 82): string {
  let img = nativeImage.createFromBuffer(pngBuffer)
  if (img.isEmpty()) {
    return pngBuffer.toString('base64')
  }

  const { width } = img.getSize()
  if (width > maxWidth) {
    img = img.resize({ width: maxWidth, quality: 'best' })
  }

  const jpeg = img.toJPEG(quality)
  if (!jpeg || jpeg.length < 50) {
    return pngBuffer.toString('base64')
  }
  return jpeg.toString('base64')
}

export async function captureScreenText(activeWindowOnly = false): Promise<ScreenCaptureResult> {
  if (isCapturing) {
    throw new Error('Screen capture already in progress')
  }

  isCapturing = true

  let activeWindowBounds: WindowBounds | null = null
  if (activeWindowOnly) {
    activeWindowBounds = getActiveWindowBounds()
    if (activeWindowBounds?.title?.includes('Specter')) {
      activeWindowBounds = null
    }
  }

  const wasVisible = hideOverlayForCapture()
  try {
    if (wasVisible) await waitForRepaint()

    let imgBuffer = await grabScreenPng()

    if (activeWindowBounds) {
      const primaryDisplay = screen.getPrimaryDisplay()
      imgBuffer = cropImageBuffer(imgBuffer, activeWindowBounds, primaryDisplay.bounds)
    }

    const base64 = toJpegBase64(imgBuffer)

    if (wasVisible) restoreOverlay()

    let text = ''
    try {
      text = await ocrInWorker(imgBuffer)
    } catch (err) {
      console.warn('[Specter] OCR failed (screenshot will still be sent):', err)
    }

    return {
      text,
      screenshot: base64,
      timestamp: Date.now()
    }
  } catch (err: unknown) {
    if (wasVisible) restoreOverlay()
    const message = err instanceof Error ? err.message : 'Screen capture failed'
    throw new Error(message)
  } finally {
    isCapturing = false
  }
}

export async function captureScreenOnly(): Promise<{ screenshot: string; timestamp: number }> {
  const wasVisible = hideOverlayForCapture()
  try {
    if (wasVisible) await waitForRepaint()

    const imgBuffer = await grabScreenPng()

    if (wasVisible) restoreOverlay()

    return {
      screenshot: toJpegBase64(imgBuffer),
      timestamp: Date.now()
    }
  } catch (err: unknown) {
    if (wasVisible) restoreOverlay()
    const message = err instanceof Error ? err.message : 'Screen capture failed'
    throw new Error(message)
  }
}

export function isCurrentlyCapturing(): boolean {
  return isCapturing
}
