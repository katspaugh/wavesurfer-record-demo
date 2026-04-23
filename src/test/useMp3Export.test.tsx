// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMp3Export } from '../hooks/useMp3Export'

const encodeMp3Blob = vi.fn()
const downloadBlob = vi.fn()

vi.mock('../services/audioExportService', () => ({
  encodeMp3Blob: (...args: unknown[]) => encodeMp3Blob(...args),
}))

vi.mock('../lib/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/audio')>()
  return {
    ...actual,
    downloadBlob: (...args: unknown[]) => downloadBlob(...args),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useMp3Export', () => {
  it('encodes the recorded blob, dispatches progress, and downloads the result', async () => {
    vi.useFakeTimers()
    const mp3Blob = new Blob(['mp3'], { type: 'audio/mpeg' })
    encodeMp3Blob.mockImplementation(async (_blob, _settings, _duration, onProgress: (progress: number) => void) => {
      onProgress(0.5)
      return mp3Blob
    })
    const dispatch = vi.fn()
    const pause = vi.fn()
    const { result } = renderHook(() => useMp3Export({
      dispatch,
      durationMs: 10_000,
      mp3ExportSettings: { bitRate: 32, channelCount: 1 },
      recordedBlob: new Blob(['audio'], { type: 'audio/webm' }),
      wavesurferRef: { current: { pause } } as never,
    }))

    await act(async () => result.current.exportMp3())
    await act(async () => {
      vi.runAllTimers()
    })

    expect(pause).toHaveBeenCalledTimes(1)
    expect(encodeMp3Blob).toHaveBeenCalledTimes(1)
    expect(downloadBlob).toHaveBeenCalledWith(mp3Blob, expect.stringMatching(/^field-recording-.*\.mp3$/u))
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-exporting', isExporting: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-export-progress', exportProgress: 0.5 })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-export-progress', exportProgress: 0 })
  })

  it('dispatches setting changes and reports encode failures', async () => {
    encodeMp3Blob.mockRejectedValue(new Error('encoding failed'))
    const dispatch = vi.fn()
    const { result } = renderHook(() => useMp3Export({
      dispatch,
      durationMs: 10_000,
      mp3ExportSettings: { bitRate: 32, channelCount: 1 },
      recordedBlob: new Blob(['audio'], { type: 'audio/webm' }),
      wavesurferRef: { current: null },
    }))

    act(() => result.current.setMp3BitRate(64))
    act(() => result.current.setMp3ChannelCount(2))
    await act(async () => result.current.exportMp3())

    expect(dispatch).toHaveBeenCalledWith({ type: 'set-mp3-bit-rate', bitRate: 64 })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-mp3-channel-count', channelCount: 2 })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-error', error: 'encoding failed' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-status', status: 'stopped' })
  })
})
