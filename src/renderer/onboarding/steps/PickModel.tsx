import { useState, useEffect } from 'react'
import { ArrowRight, ArrowLeft, Zap, Scale, Gift, Sparkles } from 'lucide-react'
import type { ProviderId } from '../App'

interface Props {
  provider: ProviderId
  onNext: () => void
  onBack: () => void
}

interface Choice {
  id: string
  label: string
  desc: string
  icon: typeof Zap
}

const CURATED: Record<ProviderId, Choice[]> = {
  openrouter: [
    { id: 'google/gemini-3-flash-preview', label: 'Fast', desc: 'Ultra-fast responses, great for real-time help', icon: Zap },
    { id: 'anthropic/claude-sonnet-4', label: 'Balanced', desc: 'Top-tier quality and reasoning', icon: Scale },
    { id: 'upstage/solar-pro-3:free', label: 'Free', desc: 'Free tier — perfect for testing', icon: Gift }
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Fast', desc: 'Ultra-fast, cheap, great vision — ideal for real-time use', icon: Zap },
    { id: 'gemini-2.5-pro', label: 'Deep reasoning', desc: 'Best for complex DSA and system design', icon: Scale },
    { id: 'gemini-2.0-flash', label: 'Cheapest', desc: 'Lowest cost, still fast with vision', icon: Gift }
  ],
  openai: [
    { id: 'gpt-5.5', label: 'Fast', desc: 'Latest fast flagship model', icon: Zap },
    { id: 'gpt-5.5-pro', label: 'Most capable', desc: 'Highest quality, higher cost', icon: Scale },
    { id: 'gpt-5.4-mini', label: 'Cheapest', desc: 'Small, fast, inexpensive', icon: Gift }
  ],
  codex: [
    { id: '', label: 'Your plan', desc: 'Uses your ChatGPT/Codex plan login with its default model', icon: Sparkles }
  ]
}

const MODEL_SETTING: Record<ProviderId, string> = {
  openrouter: 'selectedModel',
  gemini: 'geminiModel',
  openai: 'openaiModel',
  codex: 'codexModel'
}

export default function PickModel({ provider, onNext, onBack }: Props) {
  const choices = CURATED[provider]
  const [selected, setSelected] = useState<string>(choices[0].id)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(CURATED[provider][0].id)
  }, [provider])

  async function pickAndContinue() {
    setError(null)
    try {
      await window.moirahAPI?.setSetting(MODEL_SETTING[provider], selected)
      onNext()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save model')
    }
  }

  return (
    <div className="max-w-lg mx-auto px-8 py-8">
      <h2 className="text-lg font-semibold mb-1">Pick a model</h2>
      <p className="text-xs text-white/40 mb-4">
        You can browse all models later in Settings → Models.
      </p>
      <button
        onClick={() => window.moirahAPI?.openDashboard()}
        className="text-xs text-violet-300 hover:text-violet-200 mb-6"
      >
        Open model browser now
      </button>

      <div className="space-y-3">
        {choices.map((c) => {
          const Icon = c.icon
          const active = selected === c.id
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                active
                  ? 'border-violet-500/60 bg-violet-500/10'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  active ? 'bg-violet-500/20' : 'bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-violet-300' : 'text-white/40'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs text-white/40 mt-0.5">{c.desc}</div>
                <div className="text-[10px] font-mono text-white/25 mt-1">{c.id}</div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border shrink-0 ${
                  active ? 'border-violet-400 bg-violet-400' : 'border-white/20'
                }`}
              />
            </button>
          )
        })}
      </div>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      <div className="flex gap-2 mt-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10
                     text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <button
          onClick={pickAndContinue}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                     bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
