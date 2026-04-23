// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecorderApp } from '../hooks/useRecorderApp'
import { clearChunks, deleteSession, listSessions } from '../lib/chunkDb'

const requestMicrophoneAccess = vi.fn()
const prepareSessionForFreshRecording = vi.fn()
const startRecording = vi.fn()

vi.mock('../services/recordingService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/recordingService')>()
  return {
    ...actual,
    requestMicrophoneAccess: (...args: Parameters<typeof actual.requestMicrophoneAccess>) => requestMicrophoneAccess(...args),
  }
})

vi.mock('../services/sessionRecordingService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/sessionRecordingService')>()
  return {
    ...actual,
    prepareSessionForFreshRecording: (...args: Parameters<typeof actual.prepareSessionForFreshRecording>) => prepareSessionForFreshRecording(...args),
  }
})

vi.mock('../hooks/useWaveSurferRecorder', () => ({
  useWaveSurferRecorder: () => ({
    recorderRef: {
      current: {
        startRecording,
        stopMic: vi.fn(),
      },
    },
    renderRegions: vi.fn(),
    waveformRef: { current: null },
    wavesurferRef: {
      current: {
        empty: vi.fn(),
        pause: vi.fn(),
        setTime: vi.fn(),
      },
    },
  }),
}))

beforeEach(async () => {
  Object.defineProperty(window, 'MediaRecorder', {
    configurable: true,
    value: class MediaRecorder {},
  })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(),
    },
  })
  window.history.replaceState(null, '', '/')
  await clearChunks()
  for (const session of await listSessions()) {
    await deleteSession(session.id)
  }
  requestMicrophoneAccess.mockReset()
  prepareSessionForFreshRecording.mockReset()
  startRecording.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useRecorderApp permission handling', () => {
  it('keeps the session intact and shows a retryable message when microphone permission is denied', async () => {
    requestMicrophoneAccess.mockRejectedValue(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }))

    const { result } = renderHook(() => useRecorderApp())

    await act(async () => {
      await result.current.createSession()
    })

    await waitFor(() => {
      expect(result.current.view).toBe('recorder')
      expect(result.current.activeSession).not.toBeNull()
    })

    const activeSessionId = result.current.activeSession?.id

    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.error).toBe('Microphone permission was denied. Allow it in your browser settings, then try again.')
    expect(result.current.status).toBe('idle')
    expect(result.current.activeSession?.id).toBe(activeSessionId)
    expect(prepareSessionForFreshRecording).not.toHaveBeenCalled()
    expect(startRecording).not.toHaveBeenCalled()
  })
})
