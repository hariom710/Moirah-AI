import { Globe, KeyRound, Terminal, ArrowRight, Sparkles } from 'lucide-react'
import type { ProviderId } from '../App'

interface Props {
  provider: ProviderId
  onSelect: (p: ProviderId) => void
  onNext: () => void
}

const PROVIDERS: Array<{
  id: ProviderId
  title: string
  desc: string
  badge?: string
  icon: typeof Globe
}> = [
  {
    id: 'openrouter',
    title: 'OpenRouter',
    desc: 'Access 500+ models (GPT, Claude, Gemini, Llama) with one key. Free models available.',
    badge: 'Recommended',
    icon: Globe
  },
  {
    id: 'gemini',
    title: 'Google Gemini',
    desc: 'Free-tier friendly key from Google AI Studio. Fast with strong vision for screenshots.',
    badge: 'Free tier',
    icon: Sparkles
  },
  {
    id: 'openai',
    title: 'OpenAI',
    desc: 'Use OpenAI Platform API credits directly (pay per use).',
    icon: KeyRound
  },
  {
    id: 'codex',
    title: 'Codex Plan',
    desc: 'Use your local Codex CLI login (ChatGPT Plus/Pro plan). No API key needed.',
    icon: Terminal
  }
]

export default function ChooseProvider({ provider, onSelect, onNext }: Props) {
  return (
    <div className="max-w-lg mx-auto px-8 py-8">
      <h2 className="text-lg font-semibold mb-1">Choose your AI provider</h2>
      <p className="text-xs text-white/40 mb-6">You can change this anytime in Settings.</p>

      <div className="space-y-3">
        {PROVIDERS.map((p) => {
          const Icon = p.icon
          const active = provider === p.id
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
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
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.title}</span>
                  {p.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                      {p.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-1">{p.desc}</p>
              </div>
              <div
                className={`w-4 h-4 rounded-full border mt-1 shrink-0 ${
                  active ? 'border-violet-400 bg-violet-400' : 'border-white/20'
                }`}
              />
            </button>
          )
        })}
      </div>

      <button
        onClick={onNext}
        className="mt-6 w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
      >
        Continue <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}
