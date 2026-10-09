import { describe, it, expect } from 'vitest'
import { detectOS, DOWNLOAD_URLS, isMobileLike } from '../site/script'

describe('detectOS', () => {
  it('detects Windows', () => {
    expect(
      detectOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    ).toBe('windows')
  })

  it('detects macOS', () => {
    expect(
      detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')
    ).toBe('macos')
  })

  it('detects Linux', () => {
    expect(
      detectOS('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')
    ).toBe('linux')
  })

  it('defaults to windows for unknown agents', () => {
    expect(detectOS('some-agent/1.0')).toBe('windows')
  })
})

describe('DOWNLOAD_URLS', () => {
  it('uses stable latest-download URLs with the new artifact names', () => {
    const base = 'https://github.com/moirah-ai/moirah-ai/releases/latest/download/'
    expect(DOWNLOAD_URLS.windows.setup).toBe(`${base}moirah-setup.exe`)
    expect(DOWNLOAD_URLS.macos.arm64).toBe(`${base}moirah-mac-arm64.zip`)
    expect(DOWNLOAD_URLS.linux.appimage).toBe(`${base}moirah-linux-x64.AppImage`)
  })
})

describe('isMobileLike', () => {
  it('flags phones', () => {
    expect(isMobileLike('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(true)
    expect(isMobileLike('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe(true)
  })

  it('does not flag desktop UAs', () => {
    expect(isMobileLike('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
    expect(isMobileLike('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false)
  })
})
