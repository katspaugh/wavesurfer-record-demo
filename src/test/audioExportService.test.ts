// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeMp3 } from '../services/audioExportService'
import { DEFAULT_MP3_EXPORT_SETTINGS } from '../services/mp3EncoderCore'

type WorkerMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; error: string }

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessages: { recordedBlob: Blob; settings: unknown }[] = []
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(payload: { recordedBlob: Blob; settings: unknown }) {
    this.postMessages.push(payload)
  }

  terminate() {
    this.terminated = true
  }

  emit(message: WorkerMessage) {
    this.onmessage?.({ data: message } as MessageEvent<WorkerMessage>)
  }
}

const originalWorker = (globalThis as { Worker?: unknown }).Worker

beforeEach(() => {
  FakeWorker.instances = []
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: FakeWorker,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: originalWorker,
  })
})

describe('audioExportService', () => {
  it('rejects empty recordings without spawning a worker', async () => {
    const result = await encodeMp3(new Blob([], { type: 'audio/webm' }), DEFAULT_MP3_EXPORT_SETTINGS, () => {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-state')
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('streams scaled progress (0.04 → progress*0.94 + 0.04 → 1) and resolves with the encoded blob', async () => {
    const progressValues: number[] = []
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })

    const pending = encodeMp3(blob, DEFAULT_MP3_EXPORT_SETTINGS, (p) => progressValues.push(p))
    const worker = FakeWorker.instances.at(-1)!
    expect(worker.postMessages[0]?.recordedBlob).toBe(blob)
    expect(progressValues[0]).toBeCloseTo(0.04, 5)

    worker.emit({ type: 'progress', progress: 0.5 })
    expect(progressValues.at(-1)).toBeCloseTo(0.04 + 0.5 * 0.94, 5)

    const encoded = new Blob(['mp3'], { type: 'audio/mpeg' })
    worker.emit({ type: 'done', blob: encoded })

    const result = await pending
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(encoded)
    expect(progressValues.at(-1)).toBe(1)
    expect(worker.terminated).toBe(true)
  })

  it('maps worker error messages to encoding AppErrors', async () => {
    const pending = encodeMp3(new Blob(['x']), DEFAULT_MP3_EXPORT_SETTINGS, () => {})
    const worker = FakeWorker.instances.at(-1)!

    worker.emit({ type: 'error', error: 'bad bitrate' })
    const result = await pending

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('encoding')
      expect(result.error.message).toBe('bad bitrate')
    }
    expect(worker.terminated).toBe(true)
  })

  it('treats worker.onerror as an encoding failure', async () => {
    const pending = encodeMp3(new Blob(['x']), DEFAULT_MP3_EXPORT_SETTINGS, () => {})
    const worker = FakeWorker.instances.at(-1)!

    worker.onerror?.({ message: 'worker crashed' })
    const result = await pending

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('encoding')
      expect(result.error.message).toBe('worker crashed')
    }
  })

  it('treats worker.onmessageerror as an encoding failure', async () => {
    const pending = encodeMp3(new Blob(['x']), DEFAULT_MP3_EXPORT_SETTINGS, () => {})
    const worker = FakeWorker.instances.at(-1)!

    worker.onmessageerror?.()
    const result = await pending

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('encoding')
  })
})
