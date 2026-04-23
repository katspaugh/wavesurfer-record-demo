import { describe, expect, it } from 'vitest'
import { initialRecorderState, recorderReducer } from '../state/recorderReducer'
import type { RecordingSession } from '../types'

function session(overrides: Partial<RecordingSession> = {}): RecordingSession {
  return {
    id: 'session-1',
    title: 'Session 01',
    status: 'draft',
    createdAt: 100,
    updatedAt: 100,
    durationMs: 0,
    size: 0,
    mimeType: 'audio/webm',
    chunkCount: 0,
    ...overrides,
  }
}

describe('recorderReducer', () => {
  it('upserts sessions while keeping newest first', () => {
    const existing = session({ id: 'session-1', title: 'Old' })
    const replacement = session({ id: 'session-1', title: 'Updated' })
    const other = session({ id: 'session-2', title: 'Other' })
    const state = { ...initialRecorderState, sessions: [existing, other], activeSession: existing }

    const next = recorderReducer(state, { type: 'upsert-session', session: replacement })

    expect(next.sessions.map((item) => item.title)).toEqual(['Updated', 'Other'])
    expect(next.activeSession?.title).toBe('Updated')
  })

  it('resets transient recorder output without touching sessions', () => {
    const blob = new Blob(['audio'])
    const state = {
      ...initialRecorderState,
      sessions: [session()],
      elapsedMs: 20_000,
      exportProgress: 0.5,
      isExporting: true,
      isPreviewPlaying: true,
      isTranscribing: true,
      recordedBlob: blob,
      recordedUrl: 'blob:test',
      transcript: { id: 't1', text: 'Hello', confidence: 0.9, createdAt: 200, segments: [] },
      waveformMountKey: 2,
    }

    const next = recorderReducer(state, { type: 'reset-recorder-output' })

    expect(next.sessions).toEqual(state.sessions)
    expect(next.waveformMountKey).toBe(3)
    expect(next.recordedBlob).toBeNull()
    expect(next.recordedUrl).toBeNull()
    expect(next.transcript).toBeNull()
    expect(next.elapsedMs).toBe(0)
    expect(next.isExporting).toBe(false)
    expect(next.isPreviewPlaying).toBe(false)
    expect(next.isTranscribing).toBe(false)
  })

  it('toggles mic processing independently', () => {
    const next = recorderReducer(initialRecorderState, { type: 'toggle-mic-processing', option: 'noiseSuppression' })

    expect(next.micProcessing).toEqual({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: true,
    })
  })

  it('updates MP3 export settings independently', () => {
    const withBitRate = recorderReducer(initialRecorderState, { type: 'set-mp3-bit-rate', bitRate: 64 })
    const withChannels = recorderReducer(withBitRate, { type: 'set-mp3-channel-count', channelCount: 2 })

    expect(initialRecorderState.mp3ExportSettings).toEqual({ bitRate: 32, channelCount: 1 })
    expect(withChannels.mp3ExportSettings).toEqual({ bitRate: 64, channelCount: 2 })
  })
})
