import { Ghost, ArrowRight } from 'lucide-react'

interface Props {
  onNext: () => void
  onSkip: () => void
}

export default function Welcome({ onNext, onSkip }: Props) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-10 text-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-500/20 flex items-center justify-center mb-6">
        <Ghost className="w-8 h-8 text-violet-400" />
      </div>
      <h1 className="text-2xl font-bold mb-3">Your invisible AI copilot</h1>
      <p className="text-sm text-white/50 max-w-md mb-2">
        Moirah AI reads your screen and meeting audio, then answers in an overlay
        only you can see — invisible to Zoom, Meet, and Teams screen sharing.
      </p>
      <p className="text-xs text-white/30 max-w-md mb-8">
        Setup takes about 2 minutes: connect an AI provider, pick a model, test it.
      </p>

      {/* Product visual — a mock overlay card */}
      <div className="w-64 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 mb-8 text-left">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-violet-400" />
          <span className="text-[10px] text-violet-300/70 font-medium">Moirah overlay</span>
        </div>
        <div className="space-y-1.5">
          <div className="h-2 rounded bg-white/10 w-full" />
          <div className="h-2 rounded bg-white/10 w-4/5" />
          <div className="h-2 rounded bg-violet-400/30 w-3/5" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
        >
          Get started <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={onSkip}
          className="px-4 py-2.5 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          Skip — I&apos;ll set up later
        </button>
      </div>
    </div>
  )
}
