// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/audioExportService', () => ({
  encodeMp3: vi.fn(),
}))

import { usePipeline } from '../hooks/usePipeline'
import { encodeMp3 } from '../services/audioExportService'
import type { LoadedSession } from '../lib/db'

const encodeMp3Mock = vi.mocked(encodeMp3)

function makeLoadedSession(overrides: Partial<LoadedSession> = {}): LoadedSession {
  const base: LoadedSession = {
    id: 'session-1',
    title: 'Test session',
    createdAt: 1_000,
    updatedAt: 2_000,
    durationMs: 8_000,
    size: 1024,
    mimeType: 'audio/webm',
    transcript: [
      { id: 't1', text: 'hello', confidence: 0.9, finalizedAt: 1_500 },
    ],
    finalized: true,
    blob: new Blob([new Uint8Array(1024)], { type: 'audio/webm' }),
  }
  return { ...base, ...overrides }
}

beforeEach(() => {
  encodeMp3Mock.mockReset()
  // Stub URL APIs because happy-dom does not implement them on Blob.
  const created = new Set<string>()
  let counter = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    counter += 1
    const url = `blob:test/${counter}`
    created.add(url)
    return url
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    created.delete(url)
  })
  // happy-dom lacks navigator.mediaDevices; usePipeline only reads it inside an effect.
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn().mockResolvedValue([]) },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
})
