// Codex CLI bridge — uses the user's local Codex login/ChatGPT plan.
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'

let currentCodexProcess: ChildProcessWithoutNullStreams | null = null

export interface CodexStreamCallbacks {
  onChunk: (content: string) => void
  onDone: () => void
  onError: (error: string) => void
}

function codexCommand(): string {
  return process.platform === 'win32' ? 'codex.cmd' : 'codex'
}

function buildPrompt(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): string {
  const system = messages.find((m) => m.role === 'system')?.content || ''
  const conversation = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join('\n\n')

  return [
    'You are running inside Moirah AI as a real-time meeting, screen, and interview copilot.',
    'Answer the latest user request directly and concisely. Do not edit files or run commands unless the user explicitly asks for coding changes.',
    system ? `\nSYSTEM INSTRUCTIONS:\n${system}` : '',
    conversation ? `\nCONVERSATION:\n${conversation}` : '',
    '\nReturn only the assistant response.'
  ].filter(Boolean).join('\n')
}

function parseCodexEvent(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function extractErrorMessage(raw: unknown): string {
  if (typeof raw !== 'string') return 'Codex failed to respond.'
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown }
    if (typeof parsed.detail === 'string') return parsed.detail
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    // Keep the original message below.
  }
  return raw
}

export async function streamCodexCompletion(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string,
  callbacks: CodexStreamCallbacks
): Promise<void> {
  const prompt = buildPrompt(messages)
  const args = [
    'exec',
    '--json',
    '--sandbox',
    'read-only',
    '--skip-git-repo-check',
    '--ephemeral'
  ]
  // ChatGPT-account Codex sessions only accept Codex-specific model IDs —
  // generic models (gpt-5.4, gpt-5.5, …) are rejected with a 400. Pass the
  // configured model only when it looks like a Codex model; otherwise let the
  // CLI use whatever default its login supports.
  if (/codex/i.test(model)) {
    args.push('-m', model.trim())
  }
  args.push('-')

  let completed = false
  let failed = false
  let outputSeen = false
  let stdoutBuffer = ''
  let stderrBuffer = ''

  await new Promise<void>((resolve) => {
    const child = spawn(codexCommand(), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      // codex.cmd is a batch shim on Windows — it requires a shell to launch.
      shell: process.platform === 'win32'
    })
    currentCodexProcess = child

    // Hard deadline so a hung CLI can never stall the overlay forever.
    const timeout = setTimeout(() => {
      if (!completed && !failed) {
        failed = true
        try {
          child.kill()
        } catch {
          // Already exited — the close handler below will settle.
        }
        callbacks.onError('Codex timed out after 3 minutes. Try a shorter question or restart Codex.')
        resolve()
      }
    }, 180_000)
    // Don't keep the event loop alive just for the deadline timer.
    if (typeof timeout.unref === 'function') timeout.unref()

    const finishWithError = (message: string) => {
      if (failed || completed) return
      failed = true
      callbacks.onError(message.startsWith('Codex') ? message : `Codex: ${message}`)
    }

    const handleLine = (line: string) => {
      if (!line.trim()) return
      const event = parseCodexEvent(line)
      if (!event) return

      if (event.type === 'item.completed') {
        const item = event.item as Record<string, unknown> | undefined
        if (item?.type === 'agent_message' && typeof item.text === 'string' && item.text) {
          outputSeen = true
          callbacks.onChunk(item.text)
        }
      }

      if (event.type === 'error') {
        finishWithError(extractErrorMessage(event.message))
      }

      if (event.type === 'turn.failed') {
        const error = event.error as Record<string, unknown> | undefined
        finishWithError(extractErrorMessage(error?.message))
      }

      if (event.type === 'turn.completed') {
        completed = true
        callbacks.onDone()
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8')
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() || ''
      for (const line of lines) handleLine(line)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8')
      if (stderrBuffer.length > 4000) {
        stderrBuffer = stderrBuffer.slice(-4000)
      }
    })

    child.on('error', (err) => {
      finishWithError(
        err.message.includes('ENOENT')
          ? 'Codex CLI was not found. Install it, run `codex login`, then choose Codex Plan again.'
          : `Codex failed to start: ${err.message}`
      )
      resolve()
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      if (stdoutBuffer.trim()) handleLine(stdoutBuffer)
      currentCodexProcess = null

      if (!failed && !completed) {
        const detail = stderrBuffer.trim().split(/\r?\n/).filter(Boolean).pop()
        if (code === 0 && outputSeen) {
          callbacks.onDone()
        } else {
          callbacks.onError(detail || `Codex exited without a response${typeof code === 'number' ? ` (code ${code})` : ''}.`)
        }
      }
      resolve()
    })

    child.stdin.end(prompt)
  })
}

export function cancelCodexStream(): void {
  if (currentCodexProcess) {
    currentCodexProcess.kill()
    currentCodexProcess = null
  }
}
