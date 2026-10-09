// UpdateToast — subtle restart prompt shown when a downloaded update is ready.
import { useState, useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'

interface Props {
  /** True while meeting-audio recording is active — requires confirm before quitting */
  recording?: boolean
}

export default function UpdateToast({ recording = false }: Props) {
  const [version, setVersion] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    const api = window.moirahAPI
    if (!api?.onUpdateStatus) return
    return api.onUpdateStatus((data) => {
      if (data.ready && data.version) setVersion(data.version)
    })
  }, [])

  if (!version) return null

  function handleRestart() {
    if (recording && !confirming && !restarting) {
      setConfirming(true)
      return
    }
    if (restarting) return
    setRestarting(true)
    window.moirahAPI?.installUpdate()
  }

  return (
    <div role="status" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-xs">
      <span className="flex-1 text-violet-200">
        v{version} ready — restart to update
      </span>
      <button
        onClick={handleRestart}
        disabled={restarting}
        className={
          confirming && !restarting
            ? 'flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors'
            : 'flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors'
        }
      >
        <RefreshCw className="w-3 h-3" />
        {restarting ? 'Restarting...' : confirming ? 'Recording — quit anyway?' : 'Restart'}
      </button>
      <button
        onClick={() => setVersion(null)}
        className="p-1 rounded-lg text-white/40 hover:text-white/80 transition-colors"
        aria-label="Dismiss update notification"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
