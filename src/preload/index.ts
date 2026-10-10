import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

export interface StreamChunkData {
  requestId: string
  chunk: string
}

export interface StreamDoneData {
  requestId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  totalCost: number
  model: string
}

export interface StreamErrorData {
  requestId: string
  error: string
}

export interface AIQueryOptions {
  /** Correlates stream events with the request that produced them. */
  requestId?: string
  /** Base64 screenshot captured by the overlay — sent as-is, never recaptured. */
  screenshot?: string
}

export type ConversationExportResult =
  | { ok: true; canceled: false; path: string }
  | { ok: false; canceled: true }

export interface MoirahAPI {
  // AI
  queryAI: (query: string, includeScreen: boolean, includeAudio: boolean, messageHistory?: Array<{ role: string; content: string }>, options?: AIQueryOptions) => void
  cancelAI: () => void
  onStreamChunk: (callback: (data: StreamChunkData) => void) => () => void
  onStreamDone: (callback: (data: StreamDoneData) => void) => () => void
  onStreamError: (callback: (data: StreamErrorData) => void) => () => void

  // Screen
  captureScreen: () => Promise<{ text: string; screenshot?: string; timestamp: number }>
  captureScreenPreview: () => Promise<{ screenshot: string; timestamp: number }>
  onScreenCaptureError: (callback: (error: string) => void) => () => void

  // Audio — recording is handled in renderer via MediaRecorder
  checkAudioConfig: () => Promise<{ configured: boolean; provider: string; error?: string }>
  sendAudioForTranscription: (audioData: ArrayBuffer, mimeType: string) => Promise<string>
  clearTranscript: () => void
  onTranscript: (callback: (text: string) => void) => () => void
  onAudioStatus: (callback: (status: { isRecording: boolean; duration: number; error?: string }) => void) => () => void

  // Settings
  getSetting: <T>(key: string) => Promise<T>
  setSetting: (key: string, value: unknown) => Promise<void>
  getAllSettings: () => Promise<Record<string, unknown>>

  // Models
  fetchModels: () => Promise<Array<{ id: string; name: string; pricing: { prompt: string; completion: string }; context_length: number }>>

  // Hotkeys
  onHotkeyAskAI: (callback: () => void) => () => void
  onHotkeyScreenshot: (callback: () => void) => () => void
  onHotkeyToggleAudio: (callback: () => void) => () => void
  onHotkeyToggleOverlay: (callback: () => void) => () => void

  // Auto-capture
  onAutoCaptureUpdate: (callback: (data: { text: string; timestamp: number }) => void) => () => void

  // Dashboard
  openDashboard: () => void

  // Conversations
  listConversations: () => Promise<Array<{ id: string; title: string; messages: Array<{ id: string; role: string; content: string; timestamp: number; tokenCount?: number; cost?: number }>; model: string; createdAt: number; updatedAt: number }>>
  saveConversation: (conversation: { id: string; title: string; messages: Array<{ id: string; role: string; content: string; timestamp: number; tokenCount?: number; cost?: number }>; model: string; createdAt: number; updatedAt: number }) => Promise<void>
  deleteConversation: (id: string) => void
  clearConversations: () => void
  /** Export a conversation as Markdown — opens a save dialog. */
  exportConversation: (id: string) => Promise<ConversationExportResult>

  // App
  getVersion: () => Promise<string>
  quit: () => void

  // Shell
  openExternal: (url: string) => void

  // Overlay opacity — applied via CSS (not native) to avoid WS_EX_LAYERED breaking WDA_EXCLUDEFROMCAPTURE
  onOpacityChange: (callback: (opacity: number) => void) => () => void

  // Onboarding
  completeOnboarding: (skipped?: boolean) => void
  checkCodex: () => Promise<{ installed: boolean; loggedInHint: boolean }>

  // Updates
  onUpdateStatus: (callback: (data: { version: string; ready: boolean }) => void) => () => void
  installUpdate: () => void
}

// --- Type guard helpers for IPC callback data ---
// These ensure the renderer never receives unexpected types from main process

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isStreamChunkData(v: unknown): v is StreamChunkData {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return typeof d.requestId === 'string' && typeof d.chunk === 'string'
}

function isStreamDoneData(v: unknown): v is StreamDoneData {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return (
    typeof d.requestId === 'string' &&
    typeof d.promptTokens === 'number' &&
    typeof d.completionTokens === 'number' &&
    typeof d.totalTokens === 'number' &&
    typeof d.totalCost === 'number' &&
    typeof d.model === 'string'
  )
}

function isStreamErrorData(v: unknown): v is StreamErrorData {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return typeof d.requestId === 'string' && typeof d.error === 'string'
}

function isAudioStatus(v: unknown): v is { isRecording: boolean; duration: number; error?: string } {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return typeof s.isRecording === 'boolean' && typeof s.duration === 'number'
}

function isConversationExportResult(v: unknown): v is ConversationExportResult {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  if (r.ok === false) return r.canceled === true
  return r.ok === true && r.canceled === false && typeof r.path === 'string' && r.path.length > 0
}

const api: MoirahAPI = {
  // AI
  queryAI: (query, includeScreen, includeAudio, messageHistory, options) => {
    if (typeof query !== 'string') return
    ipcRenderer.send(IPC_CHANNELS.AI_QUERY, {
      query,
      includeScreen: !!includeScreen,
      includeAudio: !!includeAudio,
      messageHistory: messageHistory || [],
      requestId: typeof options?.requestId === 'string' ? options.requestId.slice(0, 128) : '',
      screenshot: typeof options?.screenshot === 'string' ? options.screenshot : undefined
    })
  },
  cancelAI: () => {
    ipcRenderer.send(IPC_CHANNELS.AI_CANCEL)
  },
  onStreamChunk: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => {
      if (isStreamChunkData(data)) callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.AI_STREAM_CHUNK, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_CHUNK, handler)
  },
  onStreamDone: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => {
      if (isStreamDoneData(data)) callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.AI_STREAM_DONE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_DONE, handler)
  },
  onStreamError: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => {
      if (isStreamErrorData(data)) callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.AI_STREAM_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_ERROR, handler)
  },

  // Screen
  captureScreen: () => ipcRenderer.invoke(IPC_CHANNELS.SCREEN_CAPTURE),
  captureScreenPreview: () => ipcRenderer.invoke(IPC_CHANNELS.SCREEN_CAPTURE_PREVIEW),
  onScreenCaptureError: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, error: unknown) => {
      callback(isString(error) ? error : 'Screen capture failed')
    }
    ipcRenderer.on(IPC_CHANNELS.SCREEN_CAPTURE_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCREEN_CAPTURE_ERROR, handler)
  },

  // Audio — recording happens in renderer, transcription in main
  checkAudioConfig: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.AUDIO_CHECK_CONFIG) as Promise<{ configured: boolean; provider: string; error?: string }>
  },
  sendAudioForTranscription: (audioData: ArrayBuffer, mimeType: string) => {
    if (typeof mimeType !== 'string') mimeType = 'audio/webm;codecs=opus'
    return ipcRenderer.invoke(IPC_CHANNELS.AUDIO_TRANSCRIBE, audioData, mimeType) as Promise<string>
  },
  clearTranscript: () => {
    ipcRenderer.send(IPC_CHANNELS.TRANSCRIPT_CLEAR)
  },
  onTranscript: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, text: unknown) => {
      if (isString(text)) callback(text)
    }
    ipcRenderer.on(IPC_CHANNELS.AUDIO_TRANSCRIPT, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_TRANSCRIPT, handler)
  },
  onAudioStatus: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, status: unknown) => {
      if (isAudioStatus(status)) callback(status)
    }
    ipcRenderer.on(IPC_CHANNELS.AUDIO_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_STATUS, handler)
  },

  // Settings
  getSetting: <T>(key: string) => {
    if (typeof key !== 'string') return Promise.reject(new Error('Invalid key'))
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key) as Promise<T>
  },
  setSetting: (key, value) => {
    if (typeof key !== 'string') return Promise.reject(new Error('Invalid key'))
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value)
  },
  getAllSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),

  // Models
  fetchModels: () => ipcRenderer.invoke(IPC_CHANNELS.MODELS_FETCH),

  // Hotkeys
  onHotkeyAskAI: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_ASK_AI, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HOTKEY_ASK_AI, handler)
  },
  onHotkeyScreenshot: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_ASK_WITH_SCREENSHOT, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HOTKEY_ASK_WITH_SCREENSHOT, handler)
  },
  onHotkeyToggleAudio: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_TOGGLE_AUDIO, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HOTKEY_TOGGLE_AUDIO, handler)
  },
  onHotkeyToggleOverlay: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_TOGGLE_OVERLAY, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HOTKEY_TOGGLE_OVERLAY, handler)
  },

  // Dashboard
  openDashboard: () => ipcRenderer.send(IPC_CHANNELS.OPEN_DASHBOARD),

  // Auto-capture
  onAutoCaptureUpdate: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const d = data as Record<string, unknown>
        if (typeof d.text === 'string' && typeof d.timestamp === 'number') {
          callback({ text: d.text, timestamp: d.timestamp })
        }
      }
    }
    ipcRenderer.on(IPC_CHANNELS.AUTO_CAPTURE_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTO_CAPTURE_UPDATE, handler)
  },

  // Conversations
  listConversations: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_LIST),
  saveConversation: (conversation) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_SAVE, conversation),
  deleteConversation: (id) => {
    if (typeof id !== 'string') return
    ipcRenderer.send(IPC_CHANNELS.CONVERSATIONS_DELETE, id)
  },
  clearConversations: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATIONS_CLEAR),
  exportConversation: async (id) => {
    if (typeof id !== 'string' || id.length === 0) {
      return { ok: false, canceled: true }
    }
    const result = await ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_EXPORT, id)
    if (!isConversationExportResult(result)) {
      throw new Error('Invalid export response from main process')
    }
    return result
  },

  // App
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
  quit: () => ipcRenderer.send(IPC_CHANNELS.APP_QUIT),

  // Shell — open URLs in external browser
  openExternal: (url: string) => {
    if (typeof url !== 'string') return
    // Only allow http(s) URLs to prevent shell injection
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        ipcRenderer.send('shell:open-external', url)
      }
    } catch {
      // Invalid URL — ignore
    }
  },

  // Overlay opacity — received from main process, applied via CSS in renderer
  // This avoids using native win.setOpacity() which adds WS_EX_LAYERED and breaks
  // SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) on Windows
  onOpacityChange: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, opacity: unknown) => {
      if (typeof opacity === 'number' && opacity >= 0 && opacity <= 1) {
        callback(opacity)
      }
    }
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_SET_OPACITY, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_SET_OPACITY, handler)
  },

  // Onboarding
  completeOnboarding: (skipped) => {
    ipcRenderer.send(IPC_CHANNELS.ONBOARDING_COMPLETE, skipped === true)
  },
  checkCodex: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_CHECK_CODEX) as Promise<{ installed: boolean; loggedInHint: boolean }>
  },

  // Updates
  onUpdateStatus: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const d = data as Record<string, unknown>
        if (typeof d.version === 'string' && typeof d.ready === 'boolean') {
          callback({ version: d.version, ready: d.ready })
        }
      }
    }
    ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, handler)
  },
  installUpdate: () => {
    ipcRenderer.send(IPC_CHANNELS.APP_INSTALL_UPDATE)
  }
}

contextBridge.exposeInMainWorld('moirahAPI', api)
