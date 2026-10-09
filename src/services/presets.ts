// Prompt presets — one-click system-prompt styles for common interview/meeting scenarios.
// A preset is a body of instructions composed with the base copilot prompt,
// interview grounding (JD/CV), and the immutable trust policy in context-builder.

export type PresetId = 'custom' | 'dsa' | 'system-design' | 'behavioral' | 'hr' | 'meeting'

export interface Preset {
  id: PresetId
  label: string
  desc: string
}

export const PRESETS: Preset[] = [
  { id: 'custom', label: 'Custom / Default', desc: 'Standard copilot behavior — follows your custom system prompt' },
  { id: 'dsa', label: 'DSA / Coding', desc: 'Algorithms & data structures: approach, optimized code, complexity, edge cases' },
  { id: 'system-design', label: 'System Design', desc: 'Architecture questions: requirements, components, trade-offs, bottlenecks' },
  { id: 'behavioral', label: 'Behavioral (STAR)', desc: 'Behavioral questions: concise STAR answers grounded in your resume' },
  { id: 'hr', label: 'HR / General', desc: 'HR-screen questions: motivation, strengths, salary, availability' },
  { id: 'meeting', label: 'Meeting Notes', desc: 'Live meetings: summarize decisions, action items, next steps' }
]

/**
 * Coding languages offered by the language picker. Injected into the system
 * prompt so answers use the right language and idioms.
 */
export const CODING_LANGUAGES = [
  { id: 'cpp', label: 'C++', aliases: ['c++'] },
  { id: 'c', label: 'C', aliases: [] },
  { id: 'python', label: 'Python', aliases: ['python3', 'py'] },
  { id: 'java', label: 'Java', aliases: [] },
  { id: 'javascript', label: 'JavaScript', aliases: ['js'] },
  { id: 'typescript', label: 'TypeScript', aliases: ['ts'] },
  { id: 'go', label: 'Go', aliases: ['golang'] },
  { id: 'rust', label: 'Rust', aliases: [] },
  { id: 'kotlin', label: 'Kotlin', aliases: [] },
  { id: 'swift', label: 'Swift', aliases: [] }
] as const

export type CodingLanguageId = (typeof CODING_LANGUAGES)[number]['id']

export function languageLabel(id: string): string {
  const found = CODING_LANGUAGES.find((l) => l.id === id || l.aliases.includes(id as never))
  return found ? found.label : 'Python'
}

/**
 * DSA / coding mode instructions. Composed AFTER the base prompt so explicit
 * formatting here wins over generic defaults.
 */
export function dsaInstructions(languageId: string): string {
  const lang = languageLabel(languageId)
  return `DSA / CODING MODE (applies to algorithm, data-structure, and coding questions):
- Think through the problem silently, then speak the solution in this exact structure:
  1) Approach: 1-2 sentences on the algorithm and why it works.
  2) Code: a complete, runnable solution in ${lang}, with brief inline comments only where non-obvious.
  3) Complexity: time and space complexity in one line each.
  4) Edge cases: the 2-3 most important ones as short bullets.
- Prefer the optimal approach. If a simpler brute force is worth mentioning, give it in one line first, then optimize.
- Code must be interview-ready: correct, idiomatic ${lang}, no pseudocode unless asked.
- If the question is a system-design or conceptual question (not a coding problem), drop the code structure and answer conceptually.`
}

export function systemDesignInstructions(): string {
  return `SYSTEM DESIGN MODE:
- Structure answers as: clarifying requirements -> high-level components -> deep dive on the hard part -> trade-offs -> bottlenecks and scaling.
- Name concrete technologies only when they clarify a trade-off.
- Keep it speakable: short paragraphs and bullets, no exhaustive essay.`
}

export function behavioralInstructions(): string {
  return `BEHAVIORAL MODE:
- Answer every behavioral question in STAR form (Situation, Task, Action, Result), 4-6 sentences total, ready to say out loud.
- Ground every example in the resume when one is provided; never invent employers, dates, or achievements.
- End with one sentence on what was learned or the impact.`
}

export function hrInstructions(): string {
  return `HR / GENERAL MODE:
- Answer like a confident candidate: concise, positive, specific.
- "Tell me about yourself": a 30-45 second pitch — present role, relevant experience, why this role.
- Strengths/weaknesses: real and job-relevant; weaknesses come with the mitigation.
- Compensation questions: give a researched range and defer to the process; never undersell.`
}

export function meetingInstructions(): string {
  return `MEETING MODE:
- Capture decisions, action items (with owners when named), and open questions.
- Use tight bullets grouped under Decisions / Action Items / Open Questions.
- Do not editorialize; record what was said and agreed.`
}

/**
 * Compose the preset body for the given preset + language.
 * Returns '' for 'custom' (the base prompt already covers behavior).
 */
export function presetBody(preset: PresetId, languageId: string): string {
  switch (preset) {
    case 'dsa':
      return dsaInstructions(languageId)
    case 'system-design':
      return systemDesignInstructions()
    case 'behavioral':
      return behavioralInstructions()
    case 'hr':
      return hrInstructions()
    case 'meeting':
      return meetingInstructions()
    case 'custom':
    default:
      return ''
  }
}
