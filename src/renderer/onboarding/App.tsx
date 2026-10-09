// Onboarding App — first-run setup wizard for Moirah AI
import { useState } from 'react'
import { Ghost } from 'lucide-react'
import Welcome from './steps/Welcome'
import ChooseProvider from './steps/ChooseProvider'
import Connect from './steps/Connect'
import PickModel from './steps/PickModel'
import TestStep from './steps/TestStep'
import Done from './steps/Done'

declare global {
  interface Window {
    moirahAPI: import('../../preload/index').MoirahAPI
  }
}

export type ProviderId = 'openrouter' | 'openai' | 'gemini' | 'codex'

const STEP_COUNT = 6

export default function App() {
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState<ProviderId>('openrouter')

  const next = () => setStep((s) => Math.min(s + 1, STEP_COUNT - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <div className="w-screen h-screen bg-moirah-darker text-white flex flex-col overflow-hidden">
      {/* Header — Skip is always available (fast lane for technical users) */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Ghost className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="text-sm font-semibold text-white/80">Moirah AI Setup</span>
        </div>
        {step > 0 && step < STEP_COUNT - 1 && (
          <button
            onClick={() => window.moirahAPI?.completeOnboarding(true)}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Skip — I&apos;ll set up later
          </button>
        )}
      </header>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto">
        {step === 0 && <Welcome onNext={next} onSkip={() => window.moirahAPI?.completeOnboarding(true)} />}
        {step === 1 && (
          <ChooseProvider provider={provider} onSelect={setProvider} onNext={next} />
        )}
        {step === 2 && (
          <Connect provider={provider} onProviderChange={setProvider} onNext={next} onBack={back} />
        )}
        {step === 3 && <PickModel provider={provider} onNext={next} onBack={back} />}
        {step === 4 && <TestStep onNext={next} onBack={back} />}
        {step === 5 && <Done onFinish={() => window.moirahAPI?.completeOnboarding(false)} />}
      </main>

      {/* Progress dots */}
      <footer className="flex items-center justify-center gap-2 py-4 border-t border-white/5 shrink-0">
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === step ? 'bg-violet-400' : i < step ? 'bg-violet-400/40' : 'bg-white/10'
            }`}
          />
        ))}
      </footer>
    </div>
  )
}
