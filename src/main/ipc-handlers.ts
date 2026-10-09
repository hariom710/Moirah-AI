// IPC handlers — bridge between main and renderer processes
import { ipcMain, BrowserWindow, app, shell, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getSetting, setSetting, getAllSettings, getConversations, saveConversation, deleteConversation, clearConversations, isValidSetting } from '../services/store'
import { streamCompletion, cancelStream, fetchAvailableModels, estimateCost, getCachedModels, type ChatMessage } from '../services/openrouter'
import { streamOpenAICompletion, cancelOpenAIStream } from '../services/openai-api'
import { streamGeminiCompletion, cancelGeminiStream } from '../services/gemini-api'
import { streamCodexCompletion, cancelCodexStream } from '../services/codex'
import { buildSystemPrompt, buildUserMessage, estimateTokens } from '../services/context-builder'
import { presetBody, type PresetId } from '../services/presets'
import { captureScreenText, captureScreenOnly, ocrInWorker } from './screen-capture'
import { transcribeAudio, getTranscript, checkWhisperConfig, clearTranscript } from './audio-capture'
import { createDashboardWindow } from './dashboard-window'
import { setOverlayOpacity } from './overlay-window'
import { reRegisterHotkeys } from './hotkey-manager'
import { APP_VERSION, DEFAULT_MODELS, DEFAULT_SETTINGS } from '../shared/constants'
import type { Playbook, Conversation } from '../shared/types'

// --- Auto-capture timer ---
let autoCaptureTimer: ReturnType<typeof setInterval> | null = null
let lastAutoScreenText = ''
let lastAutoScreenTextAt = 0
let lastSentAutoScreenText = ''
let autoCaptureOverlay: BrowserWindow | null = null

// Auto-captured text is only a fallback for queries when fresh (< 2 min old).
const AUTO_CAPTURE_FRESH_MS = 120_000

function stopAutoCapture(): void {
  if (autoCaptureTimer) {
    clearInterval(autoCaptureTimer)
    autoCaptureTimer = null
  }
  lastAutoScreenText = ''
  lastAutoScreenTextAt = 0
  lastSentAutoScreenText = ''
}

function startAutoCapture(intervalSec: number): void {
  stopAutoCapture()

  // Clamp to reasonable range: 5-300 seconds
  const clampedInterval = Math.max(5, Math.min(300, intervalSec))

  autoCaptureTimer = setInterval(async () => {
    if (!autoCaptureOverlay || autoCaptureOverlay.isDestroyed()) {
      stopAutoCapture()
      return
    }
    try {
      const capture = await captureScreenText()
      // Track freshness on every successful capture (not just changed text),
      // so a static screen still counts as fresh fallback context.
      if (capture.text) {
        lastAutoScreenText = capture.text
        lastAutoScreenTextAt = Date.now()
      }
      // Only send if text changed meaningfully (avoid spamming identical context)
      if (capture.text && capture.text !== lastSentAutoScreenText) {
        lastSentAutoScreenText = capture.text
        if (!autoCaptureOverlay.isDestroyed()) {
          autoCaptureOverlay.webContents.send(IPC_CHANNELS.AUTO_CAPTURE_UPDATE, {
            text: capture.text,
            timestamp: Date.now()
          })
        }
      }
    } catch (err: unknown) {
      console.warn('[Moirah] Auto-capture failed:', err)
    }
  }, clampedInterval * 1000)
}

function syncAutoCapture(): void {
  const enabled = getSetting<boolean>('autoCapture')
  const interval = getSetting<number>('autoCaptureInterval') || DEFAULT_SETTINGS.autoCaptureInterval
  if (enabled) {
    startAutoCapture(interval)
  } else {
    stopAutoCapture()
  }
}

// --- Rate limiter ---
// Simple sliding-window rate limiter to prevent IPC abuse

interface RateLimitEntry {
  timestamps: number[]
  maxCalls: number
  windowMs: number
}

const rateLimiters: Record<string, RateLimitEntry> = {
  [IPC_CHANNELS.AI_QUERY]: { timestamps: [], maxCalls: 2, windowMs: 2000 },        // max 2 per 2s
  [IPC_CHANNELS.AUDIO_TRANSCRIBE]: { timestamps: [], maxCalls: 1, windowMs: 3000 }  // max 1 per 3s
}

function checkRateLimit(channel: string): boolean {
  const limiter = rateLimiters[channel]
  if (!limiter) return true

  const now = Date.now()
  // Prune old entries
  limiter.timestamps = limiter.timestamps.filter(t => now - t < limiter.windowMs)

  if (limiter.timestamps.length >= limiter.maxCalls) {
    console.warn(`[Moirah] Rate limit exceeded for ${channel}`)
    return false
  }

  limiter.timestamps.push(now)
  return true
}

// --- Input validation helpers ---

const CONVERSATION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/

const OPENAI_MODEL_PRICING: Record<string, { prompt: string; completion: string }> = {
  'gpt-5.5': { prompt: '0.000005', completion: '0.00003' },
  'gpt-5.5-pro': { prompt: '0.00003', completion: '0.00018' },
  'gpt-5.4': { prompt: '0.0000025', completion: '0.000015' },
  'gpt-5.4-mini': { prompt: '0.00000075', completion: '0.0000045' },
  'gpt-5.4-nano': { prompt: '0.0000002', completion: '0.00000125' },
  'chat-latest': { prompt: '0.000005', completion: '0.00003' }
}

const GEMINI_MODEL_PRICING: Record<string, { prompt: string; completion: string }> = {
  'gemini-2.5-flash': { prompt: '0.0000003', completion: '0.0000025' },
  'gemini-2.5-pro': { prompt: '0.00000125', completion: '0.00001' },
  'gemini-2.0-flash': { prompt: '0.0000001', completion: '0.0000004' }
}

function isValidQuery(query: unknown): query is string {
  return typeof query === 'string' && query.length > 0 && query.length <= 50000
}

function isValidConversationId(id: unknown): id is string {
  return typeof id === 'string' && CONVERSATION_ID_REGEX.test(id)
}

function isValidConversation(c: unknown): c is Conversation {
  if (typeof c !== 'object' || c === null) return false
  const conv = c as Record<string, unknown>
  return (
    typeof conv.id === 'string' && conv.id.length <= 128 &&
    typeof conv.title === 'string' && conv.title.length <= 500 &&
    Array.isArray(conv.messages) && conv.messages.length <= 1000 &&
    typeof conv.model === 'string' && conv.model.length <= 200 &&
    typeof conv.createdAt === 'number' &&
    typeof conv.updatedAt === 'number'
  )
}

function isValidMessageHistory(history: unknown): history is Array<{ role: string; content: string }> {
  if (!Array.isArray(history)) return false
  if (history.length > 50) return false // cap history length
  return history.every(
    (msg) =>
      typeof msg === 'object' && msg !== null &&
      typeof msg.role === 'string' && ['user', 'assistant', 'system'].includes(msg.role) &&
      typeof msg.content === 'string' && msg.content.length <= 50000
  )
}

function isValidSettingsKey(key: unknown): key is string {
  return typeof key === 'string' && key.length <= 100
}

function modelSupportsVision(model: string): boolean {
  const id = model.toLowerCase()
  if (id.includes('deepseek') && !id.includes('vl')) return false
  if (id.includes('llama-3') || id.includes('llama3')) return false
  const visionHints = [
    'gemini', 'claude', 'gpt-4o', 'gpt-4.1', 'gpt-5', 'gpt-4-turbo',
    'llama-4', 'llama4', 'qwen-vl', 'qwen2.5-vl', 'pixtral', 'vision',
    'sonnet', 'opus', 'haiku', 'maverick', 'flash', 'grok'
  ]
  return visionHints.some((hint) => id.includes(hint))
}

function textFromChatMessage(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

export function registerIpcHandlers(overlayWindow: BrowserWindow): void {
  // Store overlay reference for auto-capture
  autoCaptureOverlay = overlayWindow
  // AI Query — streaming with cost tracking
  ipcMain.on(IPC_CHANNELS.AI_QUERY, async (event, args: { query: string; includeScreen: boolean; includeAudio: boolean; messageHistory?: Array<{ role: string; content: string }>; requestId?: string; screenshot?: string }) => {
    const requestId = typeof args?.requestId === 'string' ? args.requestId.slice(0, 128) : ''

    const sendChunk = (chunk: string) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, { requestId, chunk })
      }
    }
    interface StreamDonePayload {
      promptTokens: number
      completionTokens: number
      totalTokens: number
      totalCost: number
      model: string
    }
    const sendDone = (data: StreamDonePayload) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.AI_STREAM_DONE, { ...data, requestId })
      }
    }
    const sendError = (error: string) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.AI_STREAM_ERROR, { requestId, error })
      }
    }

    // Rate limit
    if (!checkRateLimit(IPC_CHANNELS.AI_QUERY)) {
      sendError('Too many requests. Please wait a moment.')
      return
    }

    // Validate inputs
    if (!isValidQuery(args?.query)) {
      sendError('Invalid query.')
      return
    }

    if (args.messageHistory && !isValidMessageHistory(args.messageHistory)) {
      sendError('Invalid message history.')
      return
    }

    // Validate an attached screenshot (base64 image from the overlay preview).
    // Cap at ~8MB of base64 so a malicious renderer cannot blow up memory.
    const MAX_ATTACHED_SCREENSHOT_CHARS = 8_000_000
    let attachedScreenshot: string | undefined
    if (typeof args.screenshot === 'string' && args.screenshot.length > 0) {
      if (args.screenshot.length > MAX_ATTACHED_SCREENSHOT_CHARS || !/^[A-Za-z0-9+/=\s]+$/.test(args.screenshot)) {
        sendError('Attached screenshot is invalid.')
        return
      }
      attachedScreenshot = args.screenshot.replace(/\s+/g, '')
    }

    const aiProvider = getSetting<'openrouter' | 'openai' | 'gemini' | 'codex'>('aiProvider') || DEFAULT_SETTINGS.aiProvider
    const openrouterApiKey = getSetting<string>('openrouterApiKey')
    const openaiApiKey = getSetting<string>('openaiApiKey')
    const geminiApiKey = getSetting<string>('geminiApiKey')
    if (aiProvider === 'openrouter' && !openrouterApiKey) {
      sendError('No API key configured. Open Settings to add your OpenRouter API key.')
      return
    }
    if (aiProvider === 'openai' && !openaiApiKey) {
      sendError('No OpenAI API key configured. Open Settings to add your OpenAI API key.')
      return
    }
    if (aiProvider === 'gemini' && !geminiApiKey) {
      sendError('No Gemini API key configured. Open Settings to add your Gemini API key.')
      return
    }

    const model = aiProvider === 'codex'
      ? getSetting<string>('codexModel') || DEFAULT_SETTINGS.codexModel
      : aiProvider === 'openai'
        ? getSetting<string>('openaiModel') || DEFAULT_SETTINGS.openaiModel
        : aiProvider === 'gemini'
          ? getSetting<string>('geminiModel') || DEFAULT_SETTINGS.geminiModel
      : getSetting<string>('selectedModel') || DEFAULT_SETTINGS.selectedModel
    const systemPrompt = getSetting<string>('systemPrompt')

    let screenText = ''
    let screenshot: string | undefined
    let transcript = ''

    // An explicitly attached screenshot is used as-is — never silently recaptured.
    // OCR it best-effort so text-only providers still get the content.
    if (attachedScreenshot) {
      screenshot = attachedScreenshot
      try {
        screenText = await ocrInWorker(Buffer.from(attachedScreenshot, 'base64'))
      } catch (err: unknown) {
        console.warn('[Moirah] OCR of attached screenshot failed:', err instanceof Error ? err.message : err)
      }
    } else if (args.includeScreen) {
      // Capture screen if requested — surface failures so the overlay can show them
      try {
        const smartCrop = getSetting<boolean>('smartCrop') || false
        const capture = await captureScreenText(smartCrop)
        screenText = capture.text
        screenshot = capture.screenshot
        if (!screenText && !screenshot) {
          // Fresh capture came back empty — fall back to recent auto-capture text.
          if (lastAutoScreenText && Date.now() - lastAutoScreenTextAt < AUTO_CAPTURE_FRESH_MS) {
            screenText = lastAutoScreenText
            if (!event.sender.isDestroyed()) {
              event.sender.send(IPC_CHANNELS.SCREEN_CAPTURE_ERROR, 'Live capture was empty — using the most recent auto-captured screen text instead.')
            }
          } else if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.SCREEN_CAPTURE_ERROR, 'Screen capture returned no content.')
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Screen capture failed'
        console.warn('[Moirah] Screen capture failed:', message)
        // Fall back to recent auto-capture text before giving up on screen context.
        if (lastAutoScreenText && Date.now() - lastAutoScreenTextAt < AUTO_CAPTURE_FRESH_MS) {
          screenText = lastAutoScreenText
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.SCREEN_CAPTURE_ERROR, `Live capture failed (${message}) — using the most recent auto-captured screen text instead.`)
          }
        } else if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.SCREEN_CAPTURE_ERROR, message)
        }
      }
    }

    // Get audio transcript if requested
    if (args.includeAudio) {
      transcript = getTranscript()
    }

    // Get active playbooks and inject as context
    const playbooks = getSetting<Playbook[]>('playbooks') || []
    const activePlaybooks = playbooks.filter(p => p.isActive)
    let playbookContext = ''
    if (activePlaybooks.length > 0) {
      playbookContext = activePlaybooks
        .map(p => `[PLAYBOOK: ${p.name}]\n${p.content}`)
        .join('\n\n')
    }

    // Interview grounding — JD + CV (only when interviewMode is on)
    const interviewMode = getSetting<boolean>('interviewMode') || false
    const interviewCompany = (getSetting<string>('interviewCompany') || '').slice(0, 500)
    const interviewRole = (getSetting<string>('interviewRole') || '').slice(0, 500)
    const jobDescription = (getSetting<string>('jobDescription') || '').slice(0, 20000)
    const resumeText = (getSetting<string>('resumeText') || '').slice(0, 20000)
    const hasInterviewProfile = interviewMode && !!(interviewCompany || interviewRole || jobDescription || resumeText)

    // Only OpenRouter (vision-capable models), direct OpenAI, and Gemini receive
    // image bytes. Codex is text-only: the prompt builder then tells the model to rely on OCR text.
    const imageAttached = !!screenshot && (
      aiProvider === 'openai' ||
      aiProvider === 'gemini' ||
      (aiProvider === 'openrouter' && modelSupportsVision(model))
    )

    const userMessage = buildUserMessage({
      screenText,
      transcript,
      userQuery: args.query,
      screenshot,
      imageAttached,
      interviewCompany: hasInterviewProfile ? interviewCompany : undefined,
      interviewRole: hasInterviewProfile ? interviewRole : undefined,
      jobDescription: hasInterviewProfile ? jobDescription : undefined,
      resumeText: hasInterviewProfile ? resumeText : undefined,
      interviewMode: hasInterviewProfile
    })

    const fullUserMessage = playbookContext
      ? `${playbookContext}\n\n${userMessage}`
      : userMessage

    // Prompt preset + coding language (DSA mode forces the DSA preset)
    const promptPreset = getSetting<PresetId>('promptPreset') || 'custom'
    const codingLanguage = getSetting<string>('codingLanguage') || 'python'
    const dsaMode = getSetting<boolean>('dsaMode') || false
    const effectivePreset: PresetId = dsaMode && promptPreset === 'custom' ? 'dsa' : promptPreset
    const extraPrompt = presetBody(effectivePreset, codingLanguage)

    // Build messages array: system prompt (+ preset + interview grounding) + history + new message
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(systemPrompt, {
          company: interviewCompany,
          role: interviewRole,
          jobDescription,
          resumeText,
          interviewMode: hasInterviewProfile
        }, extraPrompt)
      }
    ]

    // Add conversation history (last 10 messages max to stay within context limits)
    if (args.messageHistory && args.messageHistory.length > 0) {
      const recentHistory = args.messageHistory.slice(-10)
      for (const msg of recentHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
        }
      }
    }

    // Send the screenshot as a vision image when the model can use it.
    // OCR text is still included as extra context for text-only models.
    if (imageAttached && screenshot) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: fullUserMessage },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshot}` } }
        ]
      })
    } else {
      messages.push({ role: 'user', content: fullUserMessage })
    }

    // Estimate prompt tokens for cost tracking
    const promptTokens = estimateTokens(messages.map((m) => textFromChatMessage(m.content)).join(' '))
    let completionContent = ''

    const streamCallbacks = {
      onChunk: (content: string) => {
        completionContent += content
        sendChunk(content)
      },
      onDone: () => {
        const completionTokens = estimateTokens(completionContent)
        const totalTokens = promptTokens + completionTokens
        const modelLabel = aiProvider === 'codex' ? `codex/${model}` : aiProvider === 'openai' ? `openai/${model}` : aiProvider === 'gemini' ? `gemini/${model}` : model
        const modelInfo = aiProvider === 'openrouter'
          ? DEFAULT_MODELS.find(m => m.id === model) || getCachedModels().find(m => m.id === model)
          : aiProvider === 'openai'
            ? { pricing: OPENAI_MODEL_PRICING[model] }
            : aiProvider === 'gemini'
              ? { pricing: GEMINI_MODEL_PRICING[model] }
              : undefined
        const promptPrice = modelInfo?.pricing?.prompt || '0'
        const completionPrice = modelInfo?.pricing?.completion || '0'
        const totalCost = aiProvider === 'codex'
          ? 0
          : estimateCost(promptTokens, completionTokens, promptPrice, completionPrice)
        sendDone({
          promptTokens,
          completionTokens,
          totalTokens,
          totalCost,
          model: modelLabel
        })
      },
      onError: (error: string) => {
        sendError(error)
      }
    }

    const textOnlyMessages = messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: textFromChatMessage(msg.content)
    }))

    if (aiProvider === 'codex') {
      await streamCodexCompletion(textOnlyMessages, model, streamCallbacks)
    } else if (aiProvider === 'openai') {
      await streamOpenAICompletion(textOnlyMessages, model, openaiApiKey, streamCallbacks, 1500, imageAttached ? screenshot : undefined)
    } else if (aiProvider === 'gemini') {
      await streamGeminiCompletion(textOnlyMessages, model, geminiApiKey, streamCallbacks, 1500, imageAttached ? screenshot : undefined)
    } else {
      await streamCompletion(messages, model, openrouterApiKey, streamCallbacks)
    }
  })

  // Cancel AI stream
  ipcMain.on(IPC_CHANNELS.AI_CANCEL, () => {
    cancelStream()
    cancelOpenAIStream()
    cancelGeminiStream()
    cancelCodexStream()
  })

  // Screen capture (with OCR)
  ipcMain.handle(IPC_CHANNELS.SCREEN_CAPTURE, async () => {
    try {
      return await captureScreenText()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Screen capture failed'
      throw new Error(message)
    }
  })

  // Screen capture preview (no OCR, just screenshot)
  ipcMain.handle(IPC_CHANNELS.SCREEN_CAPTURE_PREVIEW, async () => {
    try {
      return await captureScreenOnly()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Screen capture failed'
      throw new Error(message)
    }
  })

  // Audio config check — called before starting recording to give immediate feedback
  ipcMain.handle(IPC_CHANNELS.AUDIO_CHECK_CONFIG, () => {
    return checkWhisperConfig()
  })

  // Clear the rolling transcript buffer — called when a new chat or a new
  // recording session starts so stale speech never leaks into later answers.
  ipcMain.on(IPC_CHANNELS.TRANSCRIPT_CLEAR, () => {
    clearTranscript()
  })

  // Audio transcription — receives audio buffer from renderer's MediaRecorder
  // Electron IPC can deliver ArrayBuffer as Buffer, Uint8Array, or ArrayBuffer depending on version
  ipcMain.handle(IPC_CHANNELS.AUDIO_TRANSCRIBE, async (_event, audioData: unknown, mimeType: string) => {
    // Rate limit
    if (!checkRateLimit(IPC_CHANNELS.AUDIO_TRANSCRIBE)) {
      throw new Error('Transcription rate limit exceeded. Please wait.')
    }

    // Validate mimeType is a string
    if (typeof mimeType !== 'string' || mimeType.length > 100) {
      throw new Error('Invalid MIME type')
    }

    try {
      let buffer: Buffer
      if (Buffer.isBuffer(audioData)) {
        buffer = audioData
      } else if (audioData instanceof ArrayBuffer) {
        buffer = Buffer.from(audioData)
      } else if (ArrayBuffer.isView(audioData)) {
        buffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength)
      } else {
        buffer = Buffer.from(audioData as ArrayBuffer)
      }
      const text = await transcribeAudio(buffer, mimeType || 'audio/webm;codecs=opus')
      return text
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transcription failed'
      throw new Error(message)
    }
  })

  // Settings — with allowlist validation
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => {
    if (!isValidSettingsKey(key)) {
      throw new Error('Invalid settings key')
    }
    return getSetting(key)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, key: string, value: unknown) => {
    if (!isValidSettingsKey(key)) {
      throw new Error('Invalid settings key')
    }
    if (!isValidSetting(key, value)) {
      throw new Error(`Invalid value for setting: ${key}`)
    }
    setSetting(key, value)
    // Live-update overlay opacity when changed
    if (key === 'overlayOpacity' && typeof value === 'number') {
      setOverlayOpacity(value)
    }
    // Re-sync auto-capture when its settings change
    if (key === 'autoCapture' || key === 'autoCaptureInterval') {
      syncAutoCapture()
    }
    // Re-register hotkeys when hotkey settings change
    if (key === 'hotkeys') {
      reRegisterHotkeys()
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    return getAllSettings()
  })

  // Models
  ipcMain.handle(IPC_CHANNELS.MODELS_FETCH, async () => {
    const apiKey = getSetting<string>('openrouterApiKey')
    if (!apiKey) {
      throw new Error('No API key configured')
    }
    return fetchAvailableModels(apiKey)
  })

  // Dashboard
  ipcMain.on(IPC_CHANNELS.OPEN_DASHBOARD, () => {
    createDashboardWindow()
  })

  // Conversations — with input validation
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_LIST, () => {
    return getConversations()
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_SAVE, (_event, conversation: unknown) => {
    if (!isValidConversation(conversation)) {
      throw new Error('Invalid conversation data')
    }
    saveConversation(conversation as Conversation)
  })

  ipcMain.on(IPC_CHANNELS.CONVERSATIONS_DELETE, (_event, id: unknown) => {
    if (!isValidConversationId(id)) {
      console.warn('[Moirah] Invalid conversation ID for delete:', id)
      return
    }
    deleteConversation(id)
  })

  ipcMain.on(IPC_CHANNELS.CONVERSATIONS_CLEAR, () => {
    clearConversations()
  })

  // Export a conversation as Markdown via save dialog
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_EXPORT, async (_event, id: unknown) => {
    if (!isValidConversationId(id)) {
      throw new Error('Invalid conversation ID')
    }
    const conv = getConversations().find((c) => c.id === id)
    if (!conv) throw new Error('Conversation not found')

    const safeTitle = (conv.title || 'session').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').slice(0, 60).trim() || 'session'
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export conversation',
      defaultPath: `moirah-${safeTitle}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }

    const lines: string[] = [
      `# ${conv.title}`,
      '',
      `- Model: ${conv.model}`,
      `- Created: ${new Date(conv.createdAt).toLocaleString()}`,
      `- Exported: ${new Date().toLocaleString()}`,
      '',
      '---',
      ''
    ]
    for (const m of conv.messages) {
      if (m.role === 'system') continue
      const who = m.role === 'user' ? 'You' : 'Moirah'
      lines.push(`## ${who} — ${new Date(m.timestamp).toLocaleString()}`, '', m.content, '')
    }
    await writeFile(filePath, lines.join('\n'), 'utf8')
    return { ok: true, path: filePath }
  })

  // App
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return APP_VERSION
  })

  ipcMain.on(IPC_CHANNELS.APP_QUIT, () => {
    stopAutoCapture()
    app.quit()
  })

  // Shell — open URLs in external browser (validated in preload)
  ipcMain.on('shell:open-external', (_event, url: unknown) => {
    if (typeof url !== 'string') return
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // Invalid URL — ignore
    }
  })

  // Initialize auto-capture if enabled
  syncAutoCapture()
}
