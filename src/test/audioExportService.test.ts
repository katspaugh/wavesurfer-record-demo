// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_EXPORT_DURATION_MS } from '../lib/audio'
import { encodeMp3Blob } from '../services/audioExportService'

const mocks = vi.hoisted(() => ({
  decodeBlobToPcm: vi.fn(),
}))

vi.mock('../lib/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/audio')>()
  return {
    ...actual,
    decodeBlobToPcm: mocks.decodeBlobToPcm,
  }
})

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
  it('rejects recordings over the configured export duration cap before decoding', async () => {
    await expect(encodeMp3Blob(
      new Blob(['audio']),
      { bitRate: 32, channelCount: 1 },
      MAX_EXPORT_DURATION_MS + 1,
      () => undefined,
    )).rejects.toThrow('MP3 export is capped')

    expect(mocks.decodeBlobToPcm).not.toHaveBeenCalled()
  })

  it('streams worker progress and terminates after a successful encode', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    mocks.decodeBlobToPcm.mockResolvedValue({
      channels: [new Float32Array([0, 0.25])],
      duration: 1,
      sampleRate: 48_000,
    })
    const onProgress = vi.fn()

    const blob = await encodeMp3Blob(
      new Blob(['audio']),
      { bitRate: 32, channelCount: 1 },
      1_000,
      onProgress,
    )

    expect(blob.type).toBe('audio/mpeg')
    expect(FakeWorker.current?.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 48_000 }),
      expect.any(Array),
    )
    expect(FakeWorker.current?.terminate).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(0.14)
    expect(onProgress).toHaveBeenCalledWith(0.55)
  })
})
