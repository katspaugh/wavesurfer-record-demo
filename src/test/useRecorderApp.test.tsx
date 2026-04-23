// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecorderApp } from '../hooks/useRecorderApp'
import { clearChunks, deleteSession, listSessions, saveChunk, saveSession } from '../lib/chunkDb'
import type { RecordingSession, StoredChunk } from '../types'

beforeEach(async () => {
  Object.defineProperty(window, 'MediaRecorder', {
    configurable: true,
    value: class MediaRecorder {},
  })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {},
  })
  window.history.replaceState(null, '', '/')
  await clearChunks()
  for (const session of await listSessions()) {
    await deleteSession(session.id)
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function session(overrides: Partial<RecordingSession> = {}): RecordingSession {
  return {
    chunkCount: 2,
    createdAt: 1_700_000_000_000,
    durationMs: 12_000,
    id: 'session-1',
    mimeType: 'audio/webm',
    size: 4_096,
    status: 'paused',
    title: 'Session 01',
    updatedAt: 1_700_000_001_000,
    ...overrides,
  }
}

function chunk(overrides: Partial<StoredChunk> = {}): StoredChunk {
  return {
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
    createdAt: 1_700_000_000_000,
    id: crypto.randomUUID(),
    sequence: 0,
    sessionId: 'session-1',
    size: 3,
    type: 'audio/webm',
    ...overrides,
  }
}

describe('useRecorderApp', () => {
  it('creates a persisted draft session and opens the recorder view', async () => {
    const { result } = renderHook(() => useRecorderApp())

    await act(async () => {
      await result.current.createSession()
    })

    await waitFor(() => {
      expect(result.current.view).toBe('recorder')
      expect(result.current.activeSession?.title).toBe('Session 01')
    })

    expect(result.current.canRecord).toBe(true)
    expect(result.current.status).toBe('idle')
    expect(window.location.search).toBe(`?session=${result.current.activeSession?.id}`)
    expect((await listSessions()).map((session) => session.title)).toEqual(['Session 01'])
  })

  it('removes sessions and refreshes queue stats', async () => {
    const { result } = renderHook(() => useRecorderApp())

    await act(async () => {
      await result.current.createSession()
    })
    const sessionId = result.current.activeSession!.id

    await act(async () => {
      await result.current.removeSession(sessionId)
    })

    expect(result.current.sessions).toEqual([])
    expect(await listSessions()).toEqual([])
  })

  it('reopens paused sessions in paused state with a chunk-backed preview blob', async () => {
    await saveSession(session())
    await saveChunk(chunk({ sequence: 0 }))
    await saveChunk(chunk({ sequence: 1, createdAt: 1_700_000_000_100 }))

    const { result } = renderHook(() => useRecorderApp())

    await act(async () => {
      result.current.openSession(session())
    })

    await waitFor(() => {
      expect(result.current.status).toBe('paused')
      expect(result.current.recordedBlob).not.toBeNull()
      expect(result.current.recordedUrl).toMatch(/^blob:/u)
    })
  })
})
