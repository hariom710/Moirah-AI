// Detect which AI provider an API key belongs to, based on key prefixes.
// Used by onboarding to auto-switch provider cards when the pasted key
// doesn't match the selected provider.
export type DetectedProvider = 'openrouter' | 'openai' | 'gemini' | 'unknown'

export function detectApiKeyType(key: string): DetectedProvider {
  const k = key.trim()
  if (k.startsWith('sk-or-')) return 'openrouter'
  if (k.startsWith('sk-proj-') || k.startsWith('sk-svcacct-')) return 'openai'
  // Google AI Studio keys are "AIza" + 33 alphanumeric chars.
  if (/^AIza[a-zA-Z0-9_-]{30,}$/.test(k)) return 'gemini'
  // Heuristic: "sk-" + long alphanumeric token. Legacy OpenAI secret keys look like
  // this, but so do some other providers' keys (e.g. DeepSeek) — structurally
  // indistinguishable. The wizard treats detection as a suggestion the user can override.
  if (/^sk-[a-zA-Z0-9]{20,}$/.test(k)) return 'openai'
  return 'unknown'
}
