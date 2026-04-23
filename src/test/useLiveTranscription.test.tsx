// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLiveTranscription } from '../hooks/useLiveTranscription'
import type {
  BrowserSpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionResult,
} from '../services/speechRecognitionService'

class FakeRecognition implements BrowserSpeechRecognition {
  static current: FakeRecognition | null = null

  continuous = false
  interimResults = false
  lang = ''
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())

  constructor() {
    FakeRecognition.current = this
  }
}

afterEach(() => {
  cleanup()
  FakeRecognition.current = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition
})

function result(transcript: string, confidence: number, isFinal: boolean): SpeechRecognitionResult {
  return {
    0: { transcript, confidence },
    isFinal,
    length: 1,
    item: () => ({ transcript, confidence }),
  }
}

function event(results: SpeechRecognitionResult[]): SpeechRecognitionEvent {
  return {
    resultIndex: 0,
    results: Object.assign(results, {
      item: (index: number) => results[index]!,
    }),
  }
}

describe('useLiveTranscription', () => {
  it('starts recognition, dispatches transcript updates, and persists finalized text', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeRecognition,
    })
    const dispatch = vi.fn()
    const onTranscriptSegmentsChange = vi.fn()
    const commitSessionUpdate = vi.fn().mockResolvedValue(undefined)
    const { result: hook } = renderHook(() => useLiveTranscription({
      commitSessionUpdate,
      dispatch,
      getElapsedMs: () => 2_400,
      onTranscriptSegmentsChange,
    }))

    act(() => hook.current.startLiveTranscription())

    expect(FakeRecognition.current?.continuous).toBe(true)
    expect(FakeRecognition.current?.interimResults).toBe(true)
    expect(FakeRecognition.current?.start).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-transcribing', isTranscribing: true })

    act(() => {
      FakeRecognition.current?.onresult?.(event([
        result('hello', 0.75, true),
        result('world', 0, false),
      ]))
    })

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      transcript: expect.objectContaining({
        confidence: 0.75,
        segments: [expect.objectContaining({ endMs: 2_400, text: 'hello' })],
        text: 'hello world',
      }),
      type: 'set-transcript',
    }))
    expect(commitSessionUpdate).toHaveBeenCalledWith({
      transcript: expect.objectContaining({
        confidence: 0.75,
        segments: [expect.objectContaining({ endMs: 2_400, text: 'hello' })],
        text: 'hello world',
      }),
    })
    expect(onTranscriptSegmentsChange).toHaveBeenCalledWith([
      expect.objectContaining({ endMs: 2_400, text: 'hello' }),
    ])
  })

  it('does not render regions for interim text before finalizing it', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeRecognition,
    })
    let elapsedMs = 1_000
    const dispatch = vi.fn()
    const onTranscriptSegmentsChange = vi.fn()
    const commitSessionUpdate = vi.fn().mockResolvedValue(undefined)
    const { result: hook } = renderHook(() => useLiveTranscription({
      commitSessionUpdate,
      dispatch,
      getElapsedMs: () => elapsedMs,
      onTranscriptSegmentsChange,
    }))

    act(() => hook.current.startLiveTranscription())
    act(() => {
      FakeRecognition.current?.onresult?.(event([result('checking', 0, false)]))
    })

    expect(onTranscriptSegmentsChange).not.toHaveBeenCalled()

    elapsedMs = 1_650
    act(() => {
      FakeRecognition.current?.onresult?.(event([result('checking one two', 0, false)]))
    })

    expect(onTranscriptSegmentsChange).not.toHaveBeenCalled()

    act(() => {
      FakeRecognition.current?.onresult?.(event([result('checking one two', 0.7, true)]))
    })

    expect(onTranscriptSegmentsChange).toHaveBeenCalledWith([
      expect.objectContaining({ endMs: 1_650, startMs: 1_000, text: 'checking one two' }),
    ])
    expect(commitSessionUpdate).toHaveBeenCalledWith({
      transcript: expect.objectContaining({
        segments: [expect.objectContaining({ endMs: 1_650, startMs: 1_000, text: 'checking one two' })],
        text: 'checking one two',
      }),
    })
  })

  it('reports unavailable browsers and stops an active recognizer', () => {
    const dispatch = vi.fn()
    const { result: missingHook } = renderHook(() => useLiveTranscription({
      commitSessionUpdate: vi.fn(),
      dispatch,
      getElapsedMs: () => 0,
      onTranscriptSegmentsChange: vi.fn(),
    }))

    act(() => missingHook.current.startLiveTranscription())

    expect(dispatch).toHaveBeenCalledWith({
      type: 'set-error',
      error: 'Live speech recognition is not available in this browser.',
    })
    cleanup()

    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeRecognition,
    })
    const { result: activeHook } = renderHook(() => useLiveTranscription({
      commitSessionUpdate: vi.fn(),
      dispatch,
      getElapsedMs: () => 0,
      onTranscriptSegmentsChange: vi.fn(),
    }))

    act(() => activeHook.current.startLiveTranscription())
    const activeRecognition = FakeRecognition.current
    act(() => activeHook.current.stopLiveTranscription())

    expect(activeRecognition?.stop).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-transcribing', isTranscribing: false })
  })

  it('recovers from no-speech timeouts without reporting a failure', () => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeRecognition,
    })
    const dispatch = vi.fn()
    const { result: hook } = renderHook(() => useLiveTranscription({
      commitSessionUpdate: vi.fn(),
      dispatch,
      getElapsedMs: () => 0,
      onTranscriptSegmentsChange: vi.fn(),
    }))

    act(() => hook.current.startLiveTranscription())
    const firstRecognition = FakeRecognition.current

    act(() => {
      firstRecognition?.onerror?.({ error: 'no-speech' })
      firstRecognition?.onend?.()
      vi.advanceTimersByTime(250)
    })

    expect(dispatch).toHaveBeenCalledWith({ type: 'set-error', error: null })
    expect(FakeRecognition.current).not.toBe(firstRecognition)
    expect(FakeRecognition.current?.start).toHaveBeenCalledTimes(1)
  })
})
