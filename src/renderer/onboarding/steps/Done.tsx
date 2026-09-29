import { useState, useEffect } from 'react'
import { Keyboard, MousePointerClick, Check } from 'lucide-react'
import { DEFAULT_HOTKEYS } from '../../../shared/constants'

interface Props {
  onFinish: () => void
}

interface HotkeyRow {
  key: string
  label: string
}

function buildRows(hotkeys: typeof DEFAULT_HOTKEYS): HotkeyRow[] {
  return [
    { key: hotkeys.askAI, label: 'Send / ask AI' },
    { key: hotkeys.screenshotAsk, label: 'Ask AI with screen capture' },
    { key: hotkeys.toggleOverlay, label: 'Show / hide the overlay' },
    { key: hotkeys.toggleAudio, label: 'Start / stop audio transcription' }
  ]
}

function prettyKey(k: string): string {
  return k
    .replace('CommandOrControl', 'Ctrl/Cmd')
    .replace('Return', 'Enter')
}

export default function Done({ onFinish }: Props) {
  // Show the user's actual hotkeys (they may have customised them), not the defaults.
  const [rows, setRows] = useState<HotkeyRow[]>(() => buildRows(DEFAULT_HOTKEYS))

  useEffect(() => {
    window.specterAPI?.getSetting<typeof DEFAULT_HOTKEYS>('hotkeys').then((h) => {
      if (h && typeof h.askAI === 'string') setRows(buildRows({ ...DEFAULT_HOTKEYS, ...h }))
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-lg mx-auto px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
          <Check className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">You&apos;re all set</h2>
          <p className="text-xs text-white/40">The overlay is ready — move it anywhere you like.</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="w-4 h-4 text-white/40" />
          <span className="text-sm font-medium text-white/70">Hotkeys</span>
        </div>
        <div className="space-y-2">
          {rows.map((h) => (
            <div key={h.key} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.03]">
              <span className="text-xs text-white/60">{h.label}</span>
              <code className="text-[11px] px-2 py-1 rounded bg-black/40 font-mono text-violet-300">
                {prettyKey(h.key)}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 text-xs text-white/35">
        <MousePointerClick className="w-3.5 h-3.5" />
        <span>Tip: right-click the tray icon for Settings, the setup wizard, and Quit.</span>
      </div>

      <button
        onClick={onFinish}
        className="mt-6 w-full px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500
                   text-sm font-medium transition-colors"
      >
        Start using Specter
      </button>
    </div>
  )
}
