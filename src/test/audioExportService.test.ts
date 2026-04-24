// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_EXPORT_DURATION_MS } from '../lib/audio'
import { encodeMp3Blob } from '../services/audioExportService'

class FakeWorker {
  static current: FakeWorker | null = null

  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminate = vi.fn()

  constructor() {
    FakeWorker.current = this
  }

  postMessage = vi.fn(() => {
    this.onmessage?.({ data: { type: 'progress', progress: 0.5 } } as MessageEvent)
    this.onmessage?.({ data: { type: 'done', blob: new Blob(['mp3'], { type: 'audio/mpeg' }) } } as MessageEvent)
  })
}

afterEach(() => {
  FakeWorker.current = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('audioExportService', () => {
  it('rejects recordings over the configured export duration cap before touching the worker', async () => {
    const workerSpy = vi.fn()
    vi.stubGlobal('Worker', workerSpy)

    await expect(encodeMp3Blob(
      new Blob(['audio']),
      { bitRate: 32, channelCount: 1 },
      MAX_EXPORT_DURATION_MS + 1,
      () => undefined,
    )).rejects.toThrow('MP3 export is capped')

    expect(workerSpy).not.toHaveBeenCalled()
  })

  it('sends the recorded blob to the worker and terminates after a successful encode', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const onProgress = vi.fn()
    const blobBytes = new Uint8Array([1, 2, 3, 4])
    const recordedBlob = new Blob([blobBytes])

    const result = await encodeMp3Blob(
      recordedBlob,
      { bitRate: 32, channelCount: 1 },
      1_000,
      onProgress,
    )

    expect(result.type).toBe('audio/mpeg')
    const lastCall = FakeWorker.current?.postMessage.mock.calls[0]
    if (!lastCall) throw new Error('worker was not invoked')
    const [payload, transferList] = lastCall as unknown as [
      { recordedBlob: Blob; settings: unknown },
      Transferable[] | undefined,
    ]
    expect(payload).toMatchObject({ recordedBlob, settings: { bitRate: 32, channelCount: 1 } })
    expect(transferList).toBeUndefined()
    expect(FakeWorker.current?.terminate).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(0.04)
    expect(onProgress).toHaveBeenCalledWith(0.04 + 0.5 * 0.94)
  })
})
