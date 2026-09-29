import { useState, useEffect } from 'react'
import { ArrowRight, ArrowLeft, ExternalLink, Check, Loader2, Terminal, Mic } from 'lucide-react'
import { detectApiKeyType } from '../../../shared/detect-key'
import { OPENROUTER_KEYS_URL, OPENAI_API_KEYS_URL } from '../../../shared/constants'
import type { ProviderId } from '../App'

interface Props {
  provider: ProviderId
  onProviderChange: (p: ProviderId) => void
  onNext: () => void
  onBack: () => void
}

export default function Connect({ provider, onProviderChange, onNext, onBack }: Props) {
  return (
    <div className="max-w-lg mx-auto px-8 py-8">
      {provider === 'codex' ? (
        <CodexConnect onNext={onNext} onBack={onBack} />
      ) : (
        <KeyConnect
          provider={provider}
          onProviderChange={onProviderChange}
          onNext={onNext}
          onBack={onBack}
        />
      )}
    </div>
  )
}

function KeyConnect({ provider, onProviderChange, onNext, onBack }: Props) {
  const [key, setKey] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [valid, setValid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groqKey, setGroqKey] = useState('')
  const [groqSaved, setGroqSaved] = useState(false)
  const [groqError, setGroqError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  const isRouter = provider === 'openrouter'

  function onChange(value: string) {
    setKey(value)
    setValid(false)
    setError(null)
    const detected = detectApiKeyType(value)
    if (detected !== 'unknown' && detected !== provider) {
      onProviderChange(detected)
      setNote(`That looks like ${detected === 'openrouter' ? 'an OpenRouter' : 'an OpenAI'} key — switched for you.`)
    } else {
      setNote(null)
    }
  }

  async function validate() {
    setValidating(true)
    setError(null)
    try {
      if (isRouter) {
        await window.specterAPI?.setSetting('openrouterApiKey', key.trim())
        await window.specterAPI?.fetchModels()
      } else {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key.trim()}` }
        })
        if (!res.ok) {
          throw new Error(res.status === 401 ? 'Invalid OpenAI API key.' : `OpenAI error ${res.status}`)
        }
        await window.specterAPI?.setSetting('openaiApiKey', key.trim())
      }
      await window.specterAPI?.setSetting('aiProvider', provider)
      setValid(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Validation failed'
      setError(msg)
      // Remove a bad OpenRouter key so the app isn't left in a broken state
      if (isRouter) await window.specterAPI?.setSetting('openrouterApiKey', '').catch(() => {})
    } finally {
      setValidating(false)
    }
  }

  async function saveGroq() {
    if (!groqKey.trim()) return
    setGroqError(null)
    try {
      await window.specterAPI?.setSetting('whisperProvider', 'groq')
      await window.specterAPI?.setSetting('whisperApiKey', groqKey.trim())
      setGroqSaved(true)
    } catch (e: unknown) {
      setGroqError(e instanceof Error ? e.message : 'Failed to save key')
    }
  }

  async function handleSaveGroq() {
    if (!groqKey.trim()) return
    if (!confirmOverwrite) {
      const current = await window.specterAPI?.getSetting<'groq' | 'openai' | 'custom'>('whisperProvider')
      if (current && current !== 'groq') {
        setConfirmOverwrite(true)
        setGroqError(null)
        return
      }
    }
    setConfirmOverwrite(false)
    await saveGroq()
  }

  return (
    <>
      <h2 className="text-lg font-semibold mb-1">Connect {isRouter ? 'OpenRouter' : 'OpenAI'}</h2>
      <p className="text-xs text-white/40 mb-4">
        Paste your API key. It&apos;s stored encrypted on your machine — never uploaded anywhere.
      </p>

      <button
        onClick={() =>
          window.specterAPI?.openExternal(isRouter ? OPENROUTER_KEYS_URL : OPENAI_API_KEYS_URL)
        }
        className="flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200 mb-3"
      >
        Get your key {isRouter ? '(openrouter.ai)' : '(platform.openai.com)'}
        <ExternalLink className="w-3 h-3" />
      </button>

      <input
        type="password"
        value={key}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isRouter ? 'sk-or-v1-...' : 'sk-proj-...'}
        spellCheck={false}
        className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-mono
                   focus:outline-none focus:border-violet-500/60 placeholder:text-white/20"
      />

      {note && <p className="text-xs text-violet-300/80 mt-2">{note}</p>}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {!valid ? (
        <button
          onClick={validate}
          disabled={key.trim().length < 10 || validating}
          className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                     bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed
                     text-sm font-medium transition-colors"
        >
          {validating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Validating...
            </>
          ) : (
            'Validate key'
          )}
        </button>
      ) : (
        <div className="mt-4 flex items-center gap-2 text-xs text-green-400">
          <Check className="w-3.5 h-3.5" /> Key saved and validated.
        </div>
      )}

      {/* Optional: live transcription */}
      {valid && (
        <div className="mt-6 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2 mb-2">
            <Mic className="w-3.5 h-3.5 text-white/40" />
            <span className="text-xs font-medium text-white/70">Enable live transcription (optional)</span>
          </div>
          <p className="text-[11px] text-white/35 mb-3">
            Transcribes meeting audio via Groq&apos;s free-tier Whisper. Get a free key at console.groq.com.
            Saving switches transcription to Groq and replaces any previous transcription provider.
          </p>
          {groqSaved ? (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <Check className="w-3.5 h-3.5" /> Transcription key saved.
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="password"
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="gsk_..."
                spellCheck={false}
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono
                           focus:outline-none focus:border-violet-500/60 placeholder:text-white/20"
              />
              <button
                onClick={() => void handleSaveGroq()}
                disabled={groqKey.trim().length < 10}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40
                           text-xs transition-colors"
              >
                Save
              </button>
            </div>
          )}
          {confirmOverwrite && (
            <button onClick={() => { setConfirmOverwrite(false); void saveGroq() }}
              className="mt-2 w-full px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-[11px] transition-colors">
              Replace existing transcription setup with Groq?
            </button>
          )}
          {!groqSaved && groqError && <p className="text-xs text-red-400 mt-2">{groqError}</p>}
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
        <button
          onClick={onNext}
          disabled={!valid}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                     bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed
                     text-sm font-medium transition-colors"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </>
  )
}

function CodexConnect({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [status, setStatus] = useState<{ installed: boolean; loggedInHint: boolean } | null>(null)

  // Persist the provider only when the user continues with a detected CLI.
  // Persisting on mount strands users who go Back/close with an unusable provider.
  function handleContinue() {
    window.specterAPI?.setSetting('aiProvider', 'codex').catch(() => {})
    onNext()
  }

  useEffect(() => {
    window.specterAPI?.checkCodex().then(setStatus).catch(() => setStatus({ installed: false, loggedInHint: false }))
  }, [])

  return (
    <>
      <h2 className="text-lg font-semibold mb-1">Connect Codex</h2>
      <p className="text-xs text-white/40 mb-6">
        Specter uses your local Codex CLI login — no API key needed.
      </p>

      <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-white/40" />
          <span className="text-sm font-medium">
            {status === null ? 'Checking for Codex CLI...' : status.installed ? 'Codex CLI detected' : 'Codex CLI not found'}
          </span>
          {status?.installed && <Check className="w-4 h-4 text-green-400" />}
        </div>

        {status === null && (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking for `codex` on your system...
          </div>
        )}

        {status !== null && !status.installed && (
          <div className="text-xs text-white/40 space-y-2">
            <p>Install it, log in, then come back:</p>
            <code className="block px-3 py-2 rounded-lg bg-black/40 font-mono text-[11px] text-violet-300">
              npm install -g @openai/codex
            </code>
            <code className="block px-3 py-2 rounded-lg bg-black/40 font-mono text-[11px] text-violet-300">
              codex login
            </code>
          </div>
        )}

        {status?.installed && (
          <p className="text-xs text-white/40">
            {status.loggedInHint
              ? 'Login detected. Ready to use your ChatGPT plan.'
              : 'Installed, but login not detected — run `codex login` if your first query fails.'}
          </p>
        )}
      </div>

      <div className="flex gap-2 mt-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10
                     text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!status?.installed}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                     bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed
                     text-sm font-medium transition-colors"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </>
  )
}
