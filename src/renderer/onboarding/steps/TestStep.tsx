import { useState, useEffect, useRef } from 'react'
import { ArrowRight, ArrowLeft, Play, Loader2, Check, AlertTriangle } from 'lucide-react'

interface Props {
  onNext: () => void
  onBack: () => void
}

const EXPECTED_PHRASE = 'Specter is ready to help.'

function newRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to the timestamp fallback below.
  }
  return `req-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export default function TestStep({ onNext, onBack }: Props) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phraseMismatch, setPhraseMismatch] = useState(false)
  const requestIdRef = useRef('')
  const outputRef = useRef('')

  useEffect(() => {
    const api = window.specterAPI
    if (!api) return

    const unsubChunk = api.onStreamChunk((data) => {
      if (data.requestId !== requestIdRef.current) return
      outputRef.current += data.chunk
      setOutput((prev) => prev + data.chunk)
    })
    const unsubDone = api.onStreamDone((data) => {
      if (data.requestId !== requestIdRef.current) return
      // The test passes on any completed stream, but flag it when the model
      // did not follow the exact-reply instruction — that hints at trouble
      // with instruction-following on the selected model.
      setPhraseMismatch(!outputRef.current.includes(EXPECTED_PHRASE))
      setStatus((prev) => {
        if (prev !== 'running') return prev
        return 'done'
      })
    })
    const unsubError = api.onStreamError((data) => {
      if (data.requestId !== requestIdRef.current) return
      setError(data.error)
      setStatus((prev) => (prev === 'running' ? 'error' : prev))
    })

    return () => {
      window.specterAPI?.cancelAI()
      unsubChunk()
      unsubDone()
      unsubError()
    }
  }, [])

  function runTest() {
    window.specterAPI?.cancelAI()
    const requestId = newRequestId()
    requestIdRef.current = requestId
    outputRef.current = ''
    setStatus('running')
    setOutput('')
    setError(null)
    setPhraseMismatch(false)
    window.specterAPI?.queryAI(
      'This is a setup test. Reply with exactly: Specter is ready to help.',
      false,
      false,
      [],
      { requestId }
    )
  }

  return (
    <div className="max-w-lg mx-auto px-8 py-8">
      <h2 className="text-lg font-semibold mb-1">Test it</h2>
      <p className="text-xs text-white/40 mb-6">
        Send one tiny query through your provider to confirm everything works.
      </p>

      {/* Response box */}
      <div className="min-h-32 p-4 rounded-xl border border-white/10 bg-black/30 font-mono text-xs whitespace-pre-wrap">
        {status === 'idle' && <span className="text-white/25">Response will appear here...</span>}
        {status === 'running' && (
          <span className="text-white/50">
            {output || 'Waiting for first token...'}
            <Loader2 className="w-3 h-3 animate-spin inline ml-1" />
          </span>
        )}
        {(status === 'done' || status === 'error') && output && <span className="text-white/80">{output}</span>}
        {status === 'error' && (
          <div className="flex items-start gap-2 text-red-400 mt-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {status === 'done' && (
        <div className="flex items-center gap-2 text-xs text-green-400 mt-3">
          <Check className="w-3.5 h-3.5" /> Your setup works.
        </div>
      )}
      {status === 'done' && phraseMismatch && (
        <div className="flex items-start gap-2 text-xs text-amber-400 mt-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>The model replied but did not echo the exact test phrase — it may struggle to follow strict formatting instructions.</span>
        </div>
      )}

      <div className="flex gap-2 mt-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10
                     text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        {status !== 'done' ? (
          status === 'running' ? (
            <button
              onClick={() => {
                window.specterAPI?.cancelAI()
                setStatus('idle')
              }}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                         border border-white/10 hover:bg-white/5 text-sm font-medium transition-colors"
            >
              <Loader2 className="w-4 h-4 animate-spin" /> Cancel test
            </button>
          ) : (
            <button
              onClick={runTest}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                         bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
            >
              {status === 'error' ? 'Retry test' : (<><Play className="w-4 h-4" /> Run test</>)}
            </button>
          )
        ) : (
          <button
            onClick={onNext}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                       bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            Finish up <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
