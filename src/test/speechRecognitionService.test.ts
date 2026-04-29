// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  startLiveTranscription,
  type BrowserSpeechRecognition,
  type LiveTranscriptHandlers,
  type SpeechRecognitionEvent,
} from '../services/speechRecognitionService'

class FakeSpeechRecognition implements BrowserSpeechRecognition {
  static instances: FakeSpeechRecognition[] = []
  static throwOnStart: Error | null = null

  continuous = false
  interimResults = false
  lang = ''
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null
  startCalls = 0
  stopCalls = 0

  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }

  start() {
    this.startCalls += 1
    if (FakeSpeechRecognition.throwOnStart) throw FakeSpeechRecognition.throwOnStart
  }

  stop() {
    this.stopCalls += 1
  }
}

function makeResultEvent(
  results: { transcript: string; confidence: number; isFinal: boolean }[],
): SpeechRecognitionEvent {
  const list = results.map((r) => {
    const alt = { transcript: r.transcript, confidence: r.confidence }
    const result = {
      isFinal: r.isFinal,
      length: 1,
      0: alt,
      item: () => alt,
    }
    return result
  })
  return {
    resultIndex: 0,
    results: Object.assign(list, {
      length: list.length,
      item: (i: number) => list[i]!,
    }),
  }
}

function makeHandlers(): LiveTranscriptHandlers & {
  partials: string[]
  finals: { text: string; confidence: number }[]
  errors: { code: string; message: string }[]
  ends: number
} {
  const partials: string[] = []
  const finals: { text: string; confidence: number }[] = []
  const errors: { code: string; message: string }[] = []
  let ends = 0
  return {
    partials,
    finals,
    errors,
    get ends() {
      return ends
    },
    onPartial: (text) => partials.push(text),
    onFinal: (text, confidence) => finals.push({ text, confidence }),
    onError: (error) => errors.push({ code: error.code, message: error.message }),
    onEnd: () => {
      ends += 1
    },
  }
}

beforeEach(() => {
  FakeSpeechRecognition.instances = []
  FakeSpeechRecognition.throwOnStart = null
  ;(window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeSpeechRecognition
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
})

describe('speechRecognitionService', () => {
  it('returns unsupported when no SpeechRecognition constructor exists', () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
    const result = startLiveTranscription(makeHandlers())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unsupported')
  })

  it('forwards partial transcripts via onPartial and final ones via onFinal', () => {
    const handlers = makeHandlers()
    const result = startLiveTranscription(handlers)
    if (!result.ok) throw new Error('expected start to succeed')

    const recognition = FakeSpeechRecognition.instances.at(-1)!
    recognition.onresult?.(makeResultEvent([
      { transcript: 'hello', confidence: 0, isFinal: false },
    ]))
    recognition.onresult?.(makeResultEvent([
      { transcript: 'hello world', confidence: 0.9, isFinal: true },
    ]))

    expect(handlers.partials).toEqual(['hello'])
    expect(handlers.finals).toEqual([{ text: 'hello world', confidence: 0.9 }])
  })

  it('reports speech errors via onError and stops the engine', () => {
    const handlers = makeHandlers()
    const result = startLiveTranscription(handlers)
    if (!result.ok) throw new Error('expected start to succeed')

    const recognition = FakeSpeechRecognition.instances.at(-1)!
    recognition.onerror?.({ error: 'not-allowed' })
    expect(handlers.errors).toHaveLength(1)
    expect(handlers.errors[0]?.code).toBe('speech')
    expect(handlers.errors[0]?.message).toMatch(/permission/i)
  })

  it('ignores benign no-speech errors and keeps recognizing', () => {
    const handlers = makeHandlers()
    const result = startLiveTranscription(handlers)
    if (!result.ok) throw new Error('expected start to succeed')

    const recognition = FakeSpeechRecognition.instances.at(-1)!
    recognition.onerror?.({ error: 'no-speech' })
    expect(handlers.errors).toHaveLength(0)
  })

  it('restarts the recognizer when the browser ends a session early', () => {
    const handlers = makeHandlers()
    const result = startLiveTranscription(handlers)
    if (!result.ok) throw new Error('expected start to succeed')

    const recognition = FakeSpeechRecognition.instances.at(-1)!
    recognition.onend?.()
    vi.advanceTimersByTime(250)

    expect(FakeSpeechRecognition.instances).toHaveLength(2)
    expect(handlers.ends).toBe(0)
  })

  it('stop() suppresses restart and emits onEnd', () => {
    const handlers = makeHandlers()
    const result = startLiveTranscription(handlers)
    if (!result.ok) throw new Error('expected start to succeed')

    const recognition = FakeSpeechRecognition.instances.at(-1)!
    result.value.stop()
    expect(recognition.stopCalls).toBe(1)

    recognition.onend?.()
    expect(handlers.ends).toBe(1)
    vi.advanceTimersByTime(500)
    expect(FakeSpeechRecognition.instances).toHaveLength(1)
  })

  it('reports a startup failure as a speech error', () => {
    FakeSpeechRecognition.throwOnStart = new Error('boom')
    const handlers = makeHandlers()
    const result = startLiveTranscription(handlers)

    expect(result.ok).toBe(true)
    expect(handlers.errors).toHaveLength(1)
    expect(handlers.errors[0]?.code).toBe('speech')
  })
})
