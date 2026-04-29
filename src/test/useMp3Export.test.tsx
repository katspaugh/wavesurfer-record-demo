// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/audioExportService', () => ({
  encodeMp3: vi.fn(),
}))

vi.mock('../lib/audio', async () => {
  const actual = await vi.importActual<typeof import('../lib/audio')>('../lib/audio')
  return {
    ...actual,
    downloadBlob: vi.fn(),
  }
})

import { useMp3Export } from '../hooks/useMp3Export'
import { encodeMp3 } from '../services/audioExportService'
import { downloadBlob, MAX_EXPORT_DURATION_MS } from '../lib/audio'

const encodeMp3Mock = vi.mocked(encodeMp3)
const downloadBlobMock = vi.mocked(downloadBlob)

beforeEach(() => {
  encodeMp3Mock.mockReset()
  downloadBlobMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('useMp3Export', () => {
  it('starts with default mp3 settings, no progress, and no error', () => {
    const { result } = renderHook(() => useMp3Export())
    expect(result.current.state.mp3Settings).toEqual({ bitRate: 32, channelCount: 1 })
    expect(result.current.state.exportProgress).toBe(0)
    expect(result.current.state.isExporting).toBe(false)
    expect(result.current.state.exportError).toBeNull()
  })

  it('updates mp3 settings via setBitRate and setChannelCount', () => {
    const { result } = renderHook(() => useMp3Export())

    act(() => result.current.actions.setBitRate(192))
    act(() => result.current.actions.setChannelCount(2))

    expect(result.current.state.mp3Settings).toEqual({ bitRate: 192, channelCount: 2 })
  })

  it('refuses to export when there is no blob', async () => {
    const { result } = renderHook(() => useMp3Export())
    await act(async () => {
      await result.current.actions.exportMp3(null, 1000)
    })
    expect(encodeMp3Mock).not.toHaveBeenCalled()
    expect(result.current.state.exportError).toBeNull()
  })

  it('refuses to export when duration exceeds the cap', async () => {
    const { result } = renderHook(() => useMp3Export())
    await act(async () => {
      await result.current.actions.exportMp3(new Blob(['x']), MAX_EXPORT_DURATION_MS + 1)
    })

    expect(encodeMp3Mock).not.toHaveBeenCalled()
    expect(result.current.state.exportError?.code).toBe('invalid-state')
    expect(result.current.state.exportError?.message).toMatch(/cap|trim/i)
  })

  it('encodes, downloads, and finishes with progress=1 on success', async () => {
    const encoded = new Blob(['mp3'], { type: 'audio/mpeg' })
    encodeMp3Mock.mockResolvedValue({ ok: true, value: encoded })
    const { result } = renderHook(() => useMp3Export())

    await act(async () => {
      await result.current.actions.exportMp3(new Blob(['source']), 60_000)
    })

    expect(encodeMp3Mock).toHaveBeenCalledTimes(1)
    expect(downloadBlobMock).toHaveBeenCalledTimes(1)
    expect(downloadBlobMock.mock.calls[0]?.[0]).toBe(encoded)
    expect(result.current.state.exportProgress).toBe(1)
    expect(result.current.state.isExporting).toBe(false)
    expect(result.current.state.exportError).toBeNull()
  })

  it('surfaces encoding errors and does not download', async () => {
    encodeMp3Mock.mockResolvedValue({
      ok: false,
      error: { code: 'encoding', message: 'boom' },
    })
    const { result } = renderHook(() => useMp3Export())

    await act(async () => {
      await result.current.actions.exportMp3(new Blob(['source']), 60_000)
    })

    expect(downloadBlobMock).not.toHaveBeenCalled()
    expect(result.current.state.isExporting).toBe(false)
    expect(result.current.state.exportError?.code).toBe('encoding')
  })

  it('forwards encodeMp3 progress to exportProgress', async () => {
    let captured: ((p: number) => void) | undefined
    encodeMp3Mock.mockImplementation(async (_blob, _settings, onProgress) => {
      captured = onProgress
      return { ok: true, value: new Blob(['mp3']) }
    })
    const { result } = renderHook(() => useMp3Export())

    let pending: Promise<void> | undefined
    act(() => {
      pending = result.current.actions.exportMp3(new Blob(['source']), 60_000)
    })

    expect(captured).toBeDefined()
    act(() => captured?.(0.5))
    expect(result.current.state.exportProgress).toBe(0.5)

    await act(async () => {
      await pending
    })
  })
})
