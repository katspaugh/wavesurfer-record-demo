// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoadedSession, StoredChunk } from '../lib/db'
import { MAX_RECORDING_MS } from '../lib/audio'

vi.mock('../lib/db', async () => {
  const actual = await vi.importActual<typeof import('../lib/db')>('../lib/db')
  return {
    ...actual,
    saveChunk: vi.fn(),
    getQueueSnapshotForSession: vi.fn(),
  }
})

import { useRecorder } from '../hooks/useRecorder'
import { saveChunk, getQueueSnapshotForSession } from '../lib/db'

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
  emit(blob: Blob) {
    this.ondataavailable?.({ data: blob })
  }
}

const originalMediaRecorder = (globalThis as { MediaRecorder?: unknown }).MediaRecorder
const fakeStream = { getTracks: () => [] } as unknown as MediaStream

function makeLoadedSession(overrides: Partial<LoadedSession> = {}): LoadedSession {
  return {
    id: 'session-x',
    title: 'Title',
    createdAt: 1,
    updatedAt: 2,
    durationMs: 5_000,
    size: 100,
    mimeType: 'audio/webm',
    transcript: [],
    finalized: true,
    blob: new Blob([new Uint8Array(100)], { type: 'audio/webm' }),
    ...overrides,
  }
}

beforeEach(() => {
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

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/recorder')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    writable: true,
    value: originalMediaRecorder,
  })
  vi.restoreAllMocks()
  cleanup()
})

describe('useRecorder', () => {
  it('starts idle with no initial session', () => {
    const { result } = renderHook(() => useRecorder())
    expect(result.current.state.status).toBe('idle')
    expect(result.current.state.elapsedMs).toBe(0)
    expect(result.current.state.finalBlob).toBeNull()
    expect(result.current.state.finalUrl).toBeNull()
  })

  it('seeds state from an initialSession and loads its queue snapshot', async () => {
    snapshotMock.mockResolvedValue({
      ok: true,
      value: {
        chunks: [
          { id: 'c1', sessionId: 'session-x', sequence: 0, createdAt: 10, size: 50, type: 'audio/webm' },
          { id: 'c2', sessionId: 'session-x', sequence: 1, createdAt: 20, size: 50, type: 'audio/webm' },
        ],
        bytes: 100,
      },
    })
    const session = makeLoadedSession()
    const { result } = renderHook(() => useRecorder({ initialSession: session }))

    expect(result.current.state.status).toBe('stopped')
    expect(result.current.state.elapsedMs).toBe(5_000)
    expect(result.current.state.finalBlob).toBe(session.blob)
    expect(result.current.state.finalUrl).toMatch(/^blob:/)
    expect(result.current.state.mimeType).toBe('audio/webm')

    await waitFor(() => expect(result.current.state.queueChunks).toHaveLength(2))
    expect(result.current.state.queueBytes).toBe(100)
    expect(result.current.state.recentQueueEvents).toHaveLength(2)
  })

  it('revokes the seeded preview URL on unmount', () => {
    const { result, unmount } = renderHook(() => useRecorder({ initialSession: makeLoadedSession() }))
    const url = result.current.state.finalUrl!
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })

  it('start() launches MediaRecorder and reports recording status', async () => {
    const { result } = renderHook(() => useRecorder())
    await act(async () => {
      await result.current.actions.start({ stream: fakeStream, sessionId: 'sx' })
    })
    expect(FakeMediaRecorder.instances).toHaveLength(1)
    expect(result.current.state.status).toBe('recording')
  })

  it('persists chunks to IDB and tracks queue/bytes/events', async () => {
    const { result } = renderHook(() => useRecorder())
    await act(async () => {
      await result.current.actions.start({ stream: fakeStream, sessionId: 'sx' })
    })

    const recorder = FakeMediaRecorder.instances.at(-1)!
    await act(async () => {
      recorder.emit(new Blob([new Uint8Array(10)], { type: 'audio/webm' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.state.queueChunks).toHaveLength(1))
    expect(result.current.state.queueBytes).toBe(10)
    expect(result.current.state.recentQueueEvents).toHaveLength(1)
    expect(saveChunkMock).toHaveBeenCalledTimes(1)
    const saved = saveChunkMock.mock.calls[0]?.[0] as StoredChunk
    expect(saved.sessionId).toBe('sx')
    expect(saved.sequence).toBe(0)
  })

  it('records a recorderError when saveChunk fails', async () => {
    saveChunkMock.mockResolvedValue({ ok: false, error: { code: 'storage', message: 'oof' } })
    const { result } = renderHook(() => useRecorder())
    await act(async () => {
      await result.current.actions.start({ stream: fakeStream, sessionId: 'sx' })
    })

    const recorder = FakeMediaRecorder.instances.at(-1)!
    await act(async () => {
      recorder.emit(new Blob([new Uint8Array(5)], { type: 'audio/webm' }))
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.state.recorderError?.code).toBe('storage'))
    expect(result.current.state.queueChunks).toHaveLength(0)
  })

  it('pause/resume drives status transitions', async () => {
    const { result } = renderHook(() => useRecorder())
    await act(async () => {
      await result.current.actions.start({ stream: fakeStream, sessionId: 'sx' })
    })
    act(() => result.current.actions.pause())
    expect(result.current.state.status).toBe('paused')
    act(() => result.current.actions.resume())
    expect(result.current.state.status).toBe('recording')
  })

  it('stop() finalizes a blob, sets finalUrl, and invokes onStop with duration', async () => {
    const onStop = vi.fn()
    const { result } = renderHook(() => useRecorder())
    await act(async () => {
      await result.current.actions.start({ stream: fakeStream, sessionId: 'sx', onStop })
    })

    act(() => result.current.actions.stop())

    expect(result.current.state.status).toBe('stopped')
    expect(result.current.state.finalBlob).not.toBeNull()
    expect(result.current.state.finalUrl).toMatch(/^blob:/)
    expect(onStop).toHaveBeenCalledTimes(1)
    const stopArg = onStop.mock.calls[0]?.[0] as { mimeType: string }
    expect(stopArg.mimeType).toMatch(/^audio\/webm/)
  })

  it('returns an error from start() when MediaRecorder cannot be created', async () => {
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    const { result } = renderHook(() => useRecorder())
    let outcome: { ok: boolean } | undefined
    await act(async () => {
      outcome = await result.current.actions.start({ stream: fakeStream, sessionId: 'sx' })
    })
    expect(outcome?.ok).toBe(false)
    expect(result.current.state.recorderError).not.toBeNull()
  })

  it('markRequestingMic / markIdle let the composer drive the pre-mic phase', () => {
    const { result } = renderHook(() => useRecorder())
    act(() => result.current.actions.markRequestingMic())
    expect(result.current.state.status).toBe('requesting-mic')
    act(() => result.current.actions.markIdle())
    expect(result.current.state.status).toBe('idle')
  })

  it('markIdle propagates an external error into recorderError', () => {
    const { result } = renderHook(() => useRecorder())
    act(() => result.current.actions.markIdle({ code: 'storage', message: 'no disk' }))
    expect(result.current.state.status).toBe('idle')
    expect(result.current.state.recorderError?.code).toBe('storage')
  })

  it('auto-stops once elapsedMs crosses MAX_RECORDING_MS', async () => {
    vi.useFakeTimers()
    try {
      const onStop = vi.fn()
      const { result } = renderHook(() => useRecorder())
      await act(async () => {
        await result.current.actions.start({ stream: fakeStream, sessionId: 'sx', onStop })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS + 1_000)
      })

      expect(onStop).toHaveBeenCalledTimes(1)
      expect(result.current.state.status).toBe('stopped')
      expect(result.current.state.recorderError?.code).toBe('invalid-state')
    } finally {
      vi.useRealTimers()
    }
  })
})
