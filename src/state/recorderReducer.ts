import type { ChunkMetadata, QueueStats, RecordingSession, RecordingStatus, TranscriptResult } from '../types'
import { DEFAULT_MP3_EXPORT_SETTINGS, type Mp3BitRate, type Mp3ChannelCount, type Mp3ExportSettings } from '../services/mp3EncoderCore'

export type MicProcessingOption = 'echoCancellation' | 'noiseSuppression' | 'autoGainControl'
export type AppView = 'sessions' | 'recorder'

export type MicProcessingState = Record<MicProcessingOption, boolean>

export type RecorderState = {
  view: AppView
  sessions: RecordingSession[]
  activeSession: RecordingSession | null
  status: RecordingStatus
  elapsedMs: number
  waveformMountKey: number
  recordedBlob: Blob | null
  recordedUrl: string | null
  mimeType: string
  queueStats: QueueStats
  sessionChunks: ChunkMetadata[]
  transcript: TranscriptResult | null
  isTranscribing: boolean
  isExporting: boolean
  exportProgress: number
  mp3ExportSettings: Mp3ExportSettings
  isPreviewPlaying: boolean
  micProcessing: MicProcessingState
  error: string | null
}

export type RecorderAction =
  | { type: 'set-view'; view: AppView }
  | { type: 'set-sessions'; sessions: RecordingSession[] }
  | { type: 'set-active-session'; session: RecordingSession | null }
  | { type: 'upsert-session'; session: RecordingSession }
  | { type: 'delete-session'; sessionId: string }
  | { type: 'set-status'; status: RecordingStatus }
  | { type: 'set-elapsed-ms'; elapsedMs: number }
  | { type: 'remount-waveform' }
  | { type: 'set-recorded-blob'; blob: Blob | null }
  | { type: 'set-recorded-url'; url: string | null }
  | { type: 'set-mime-type'; mimeType: string }
  | { type: 'set-queue-stats'; stats: QueueStats }
  | { type: 'set-session-chunks'; chunks: ChunkMetadata[] }
  | { type: 'set-transcript'; transcript: TranscriptResult | null }
  | { type: 'set-transcribing'; isTranscribing: boolean }
  | { type: 'set-exporting'; isExporting: boolean }
  | { type: 'set-export-progress'; exportProgress: number }
  | { type: 'set-mp3-bit-rate'; bitRate: Mp3BitRate }
  | { type: 'set-mp3-channel-count'; channelCount: Mp3ChannelCount }
  | { type: 'set-preview-playing'; isPreviewPlaying: boolean }
  | { type: 'toggle-mic-processing'; option: MicProcessingOption }
  | { type: 'set-error'; error: string | null }
  | { type: 'reset-recorder-output' }

export const initialMicProcessing: MicProcessingState = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

export const initialRecorderState: RecorderState = {
  view: 'sessions',
  sessions: [],
  activeSession: null,
  status: 'idle',
  elapsedMs: 0,
  waveformMountKey: 0,
  recordedBlob: null,
  recordedUrl: null,
  mimeType: '',
  queueStats: { chunks: 0, bytes: 0, sessions: 0 },
  sessionChunks: [],
  transcript: null,
  isTranscribing: false,
  isExporting: false,
  exportProgress: 0,
  mp3ExportSettings: DEFAULT_MP3_EXPORT_SETTINGS,
  isPreviewPlaying: false,
  micProcessing: initialMicProcessing,
  error: null,
}

export function recorderReducer(state: RecorderState, action: RecorderAction): RecorderState {
  switch (action.type) {
    case 'set-view':
      return { ...state, view: action.view }
    case 'set-sessions':
      return { ...state, sessions: action.sessions }
    case 'set-active-session':
      return { ...state, activeSession: action.session }
    case 'upsert-session':
      return {
        ...state,
        activeSession: state.activeSession?.id === action.session.id ? action.session : state.activeSession,
        sessions: [action.session, ...state.sessions.filter((session) => session.id !== action.session.id)],
      }
    case 'delete-session':
      return {
        ...state,
        activeSession: state.activeSession?.id === action.sessionId ? null : state.activeSession,
        sessions: state.sessions.filter((session) => session.id !== action.sessionId),
      }
    case 'set-status':
      return { ...state, status: action.status }
    case 'set-elapsed-ms':
      return { ...state, elapsedMs: action.elapsedMs }
    case 'remount-waveform':
      return { ...state, waveformMountKey: state.waveformMountKey + 1 }
    case 'set-recorded-blob':
      return { ...state, recordedBlob: action.blob }
    case 'set-recorded-url':
      return { ...state, recordedUrl: action.url }
    case 'set-mime-type':
      return { ...state, mimeType: action.mimeType }
    case 'set-queue-stats':
      return { ...state, queueStats: action.stats }
    case 'set-session-chunks':
      return { ...state, sessionChunks: action.chunks }
    case 'set-transcript':
      return { ...state, transcript: action.transcript }
    case 'set-transcribing':
      return { ...state, isTranscribing: action.isTranscribing }
    case 'set-exporting':
      return { ...state, isExporting: action.isExporting }
    case 'set-export-progress':
      return { ...state, exportProgress: action.exportProgress }
    case 'set-mp3-bit-rate':
      return {
        ...state,
        mp3ExportSettings: {
          ...state.mp3ExportSettings,
          bitRate: action.bitRate,
        },
      }
    case 'set-mp3-channel-count':
      return {
        ...state,
        mp3ExportSettings: {
          ...state.mp3ExportSettings,
          channelCount: action.channelCount,
        },
      }
    case 'set-preview-playing':
      return { ...state, isPreviewPlaying: action.isPreviewPlaying }
    case 'toggle-mic-processing':
      return {
        ...state,
        micProcessing: {
          ...state.micProcessing,
          [action.option]: !state.micProcessing[action.option],
        },
      }
    case 'set-error':
      return { ...state, error: action.error }
    case 'reset-recorder-output':
      return {
        ...state,
        waveformMountKey: state.waveformMountKey + 1,
        isPreviewPlaying: false,
        recordedBlob: null,
        recordedUrl: null,
        transcript: null,
        elapsedMs: 0,
        exportProgress: 0,
        isExporting: false,
        isTranscribing: false,
      }
    default:
      return state
  }
}
