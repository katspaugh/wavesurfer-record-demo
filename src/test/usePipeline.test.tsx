// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/audioExportService', () => ({
  encodeMp3: vi.fn(),
}))

vi.mock('../services/micService', async () => {
  const actual = await vi.importActual<typeof import('../services/micService')>('../services/micService')
  return {
    ...actual,
    listMicrophones: vi.fn(),
    requestMicrophoneStream: vi.fn(),
    stopStream: vi.fn(),
  }
})

vi.mock('../services/speechRecognitionService', async () => {
  const actual = await vi.importActual<typeof import('../services/speechRecognitionService')>(
    '../services/speechRecognitionService',
  )
  return {
    ...actual,
    startLiveTranscription: vi.fn(),
  }
})

vi.mock('../lib/db', async () => {
  const actual = await vi.importActual<typeof import('../lib/db')>('../lib/db')
  return {
    ...actual,
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    saveChunk: vi.fn(),
    getQueueSnapshotForSession: vi.fn(),
  }
})

import { usePipeline } from '../hooks/usePipeline'
import { encodeMp3 } from '../services/audioExportService'
import {
  listMicrophones,
  requestMicrophoneStream,
  stopStream,
} from '../services/micService'
import { startLiveTranscription } from '../services/speechRecognitionService'
import {
  createSession,
  deleteSession,
  getQueueSnapshotForSession,
  saveChunk,
  type LoadedSession,
} from '../lib/db'

const encodeMp3Mock = vi.mocked(encodeMp3)
const listMicrophonesMock = vi.mocked(listMicrophones)
const requestMicrophoneStreamMock = vi.mocked(requestMicrophoneStream)
const stopStreamMock = vi.mocked(stopStream)
const startLiveTranscriptionMock = vi.mocked(startLiveTranscription)
const createSessionMock = vi.mocked(createSession)
const deleteSessionMock = vi.mocked(deleteSession)
const saveChunkMock = vi.mocked(saveChunk)
const snapshotMock = vi.mocked(getQueueSnapshotForSession)

type RecorderState = 'inactive' | 'recording' | 'paused'
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported = vi.fn(() => true)
  state: RecorderState = 'inactive'
  mimeType: string
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onerror: ((event: Event & { error?: unknown }) => void) | null = null
  onstart: (() => void) | null = null
  onpause: (() => void) | null = null
  onresume: (() => void) | null = null
  onstop: (() => void) | null = null
  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm'
    FakeMediaRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
    this.onstart?.()
  }
  pause() {
    this.state = 'paused'
    this.onpause?.()
  }
  resume() {
    this.state = 'recording'
    this.onresume?.()
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

const originalMediaRecorder = (globalThis as { MediaRecorder?: unknown }).MediaRecorder

function makeLoadedSession(overrides: Partial<LoadedSession> = {}): LoadedSession {
  const base: LoadedSession = {
    id: 'session-1',
    title: 'Test session',
    createdAt: 1_000,
    updatedAt: 2_000,
    durationMs: 8_000,
    size: 1024,
    mimeType: 'audio/webm',
    transcript: [{ id: 't1', text: 'hello', confidence: 0.9, finalizedAt: 1_500 }],
    finalized: true,
    blob: new Blob([new Uint8Array(1024)], { type: 'audio/webm' }),
  }
  return { ...base, ...overrides }
}

beforeEach(() => {
  encodeMp3Mock.mockReset()
  listMicrophonesMock.mockReset()
  listMicrophonesMock.mockResolvedValue({ ok: true, value: [] })
  requestMicrophoneStreamMock.mockReset()
  stopStreamMock.mockReset()
  startLiveTranscriptionMock.mockReset()
  startLiveTranscriptionMock.mockReturnValue({ ok: true, value: { stop: vi.fn() } })
  createSessionMock.mockReset()
  createSessionMock.mockResolvedValue({ ok: true, value: undefined })
  deleteSessionMock.mockReset()
  deleteSessionMock.mockResolvedValue({ ok: true, value: undefined })
  saveChunkMock.mockReset()
  saveChunkMock.mockResolvedValue({ ok: true, value: undefined })
  snapshotMock.mockReset()
  snapshotMock.mockResolvedValue({ ok: true, value: { chunks: [], bytes: 0 } })

  FakeMediaRecorder.instances = []
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    writable: true,
    value: FakeMediaRecorder,
  })

  let counter = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test/${++counter}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn().mockResolvedValue([]) },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    writable: true,
    value: originalMediaRecorder,
  })
})

describe('usePipeline', () => {
  it('seeds state from an initialSession', async () => {
    const session = makeLoadedSession()
    const { result } = renderHook(() => usePipeline({ initialSession: session }))

    expect(result.current.state.status).toBe('stopped')
    expect(result.current.state.elapsedMs).toBe(8_000)
    expect(result.current.state.mimeType).toBe('audio/webm')
    expect(result.current.state.finalBlob).toBe(session.blob)
    expect(result.current.state.finalUrl).toMatch(/^blob:/)
    expect(result.current.state.transcriptSegments).toHaveLength(1)
  })

  it('revokes the preview object URL on unmount', () => {
    const session = makeLoadedSession()
    const { result, unmount } = renderHook(() => usePipeline({ initialSession: session }))
    const url = result.current.state.finalUrl
    expect(url).toBeTruthy()

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })

  it('caps MP3 export when the take exceeds the export duration limit', async () => {
    const oneHour = 60 * 60 * 1000
    const session = makeLoadedSession({ durationMs: 3 * oneHour })
    const { result } = renderHook(() => usePipeline({ initialSession: session }))

    await act(async () => {
      await result.current.actions.exportMp3()
    })

    await waitFor(() => {
      expect(result.current.state.exportError).not.toBeNull()
    })
    expect(result.current.state.exportError?.code).toBe('invalid-state')
    expect(result.current.state.exportError?.message).toMatch(/cap|trim/i)
    expect(encodeMp3Mock).not.toHaveBeenCalled()
  })

  it('forwards finalized takes through onTakeFinalized when fresh export succeeds', async () => {
    encodeMp3Mock.mockResolvedValue({ ok: true, value: new Blob(['mp3'], { type: 'audio/mpeg' }) })
    const session = makeLoadedSession()
    const { result } = renderHook(() => usePipeline({ initialSession: session }))

    await act(async () => {
      await result.current.actions.exportMp3()
    })

    expect(encodeMp3Mock).toHaveBeenCalledTimes(1)
    expect(result.current.state.exportProgress).toBe(1)
    expect(result.current.state.exportError).toBeNull()
  })

  it('startRecording resets a stale export error from a previous run', async () => {
    const session = makeLoadedSession({ durationMs: 999 * 60_000 })
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream
    requestMicrophoneStreamMock.mockResolvedValue({ ok: true, value: fakeStream })

    const { result } = renderHook(() => usePipeline({ initialSession: session }))

    await act(async () => {
      await result.current.actions.exportMp3()
    })
    expect(result.current.state.exportError?.code).toBe('invalid-state')

    await act(async () => {
      await result.current.actions.startRecording()
    })

    expect(result.current.state.exportError).toBeNull()
    expect(result.current.state.exportProgress).toBe(0)
  })

  it('releases the mic stream and surfaces a recorderError when createSession fails', async () => {
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream
    requestMicrophoneStreamMock.mockResolvedValue({ ok: true, value: fakeStream })
    createSessionMock.mockResolvedValue({
      ok: false,
      error: { code: 'storage', message: 'IDB write failed' },
    })

    const { result } = renderHook(() => usePipeline())

    await act(async () => {
      await result.current.actions.startRecording()
    })

    expect(stopStreamMock).toHaveBeenCalledWith(fakeStream)
    expect(result.current.state.recorderError?.code).toBe('storage')
    expect(result.current.state.status).toBe('idle')
    expect(FakeMediaRecorder.instances).toHaveLength(0)
  })

  it('stopRecording tears down transcription synchronously, before MediaRecorder.onstop fires', async () => {
    const speechStop = vi.fn()
    startLiveTranscriptionMock.mockReturnValue({ ok: true, value: { stop: speechStop } })
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream
    requestMicrophoneStreamMock.mockResolvedValue({ ok: true, value: fakeStream })

    const { result } = renderHook(() => usePipeline())

    await act(async () => {
      await result.current.actions.startRecording()
    })
    expect(speechStop).not.toHaveBeenCalled()
    const recorder = FakeMediaRecorder.instances.at(-1)!
    // Defer the recorder's onstop so we can prove transcription tears down before it fires.
    const realOnStop = recorder.onstop
    let pendingStop: (() => void) | null = null
    recorder.onstop = null
    recorder.stop = function deferredStop() {
      this.state = 'inactive'
      pendingStop = () => realOnStop?.()
    }

    act(() => result.current.actions.stopRecording())

    expect(speechStop).toHaveBeenCalledTimes(1)
    expect(stopStreamMock).not.toHaveBeenCalled()

    act(() => pendingStop?.())
    expect(stopStreamMock).toHaveBeenCalledWith(fakeStream)
  })
})
