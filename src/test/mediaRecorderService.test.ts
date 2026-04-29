import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startMediaRecorder, type RecorderHandlers } from '../services/mediaRecorderService'

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
  startCalledWith: number | undefined

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm'
    FakeMediaRecorder.instances.push(this)
  }

  start(timeslice?: number) {
    this.startCalledWith = timeslice
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

  emitChunk(blob: Blob) {
    this.ondataavailable?.({ data: blob })
  }
}

const originalMediaRecorder = (globalThis as { MediaRecorder?: unknown }).MediaRecorder

beforeEach(() => {
  FakeMediaRecorder.instances = []
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    writable: true,
    value: FakeMediaRecorder,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    writable: true,
    value: originalMediaRecorder,
  })
})

function makeHandlers(): RecorderHandlers & {
  chunks: Blob[]
  states: string[]
  errors: unknown[]
  finals: { blob: Blob; mime: string }[]
} {
  const chunks: Blob[] = []
  const states: string[] = []
  const errors: unknown[] = []
  const finals: { blob: Blob; mime: string }[] = []
  return {
    chunks,
    states,
    errors,
    finals,
    onChunk: (blob) => chunks.push(blob),
    onStateChange: (state) => states.push(state),
    onError: (error) => errors.push(error),
    onStop: (blob, mime) => finals.push({ blob, mime }),
  }
}

describe('mediaRecorderService', () => {
  it('starts the recorder, forwards chunks, and finalizes a blob on stop', () => {
    const handlers = makeHandlers()
    const stream = {} as MediaStream

    const result = startMediaRecorder(stream, handlers, 500)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const recorder = FakeMediaRecorder.instances.at(-1)!
    expect(recorder.startCalledWith).toBe(500)
    expect(handlers.states).toContain('recording')

    recorder.emitChunk(new Blob(['a'], { type: 'audio/webm' }))
    recorder.emitChunk(new Blob(['bc'], { type: 'audio/webm' }))
    expect(handlers.chunks).toHaveLength(2)

    const stopped = result.value.stop()
    expect(stopped.ok).toBe(true)
    expect(handlers.states).toContain('stopped')
    expect(handlers.finals).toHaveLength(1)
    expect(handlers.finals[0]?.blob.size).toBeGreaterThan(0)
  })

  it('returns unsupported when MediaRecorder is missing', () => {
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: undefined, writable: true })
    const result = startMediaRecorder({} as MediaStream, makeHandlers())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unsupported')
  })

  it('reports pause/resume transitions through onStateChange', () => {
    const handlers = makeHandlers()
    const result = startMediaRecorder({} as MediaStream, handlers)
    if (!result.ok) throw new Error('expected start to succeed')

    expect(result.value.pause().ok).toBe(true)
    expect(handlers.states).toContain('paused')
    expect(result.value.resume().ok).toBe(true)
    expect(handlers.states.filter((s) => s === 'recording').length).toBeGreaterThanOrEqual(2)
  })
})
