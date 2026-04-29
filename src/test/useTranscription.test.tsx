// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveTranscriptHandlers, SpeechHandle } from '../services/speechRecognitionService'

vi.mock('../services/speechRecognitionService', async () => {
  const actual = await vi.importActual<typeof import('../services/speechRecognitionService')>(
    '../services/speechRecognitionService',
  )
  return {
    ...actual,
    startLiveTranscription: vi.fn(),
  }
})

import { useTranscription } from '../hooks/useTranscription'
import { startLiveTranscription } from '../services/speechRecognitionService'

const startMock = vi.mocked(startLiveTranscription)

let lastHandlers: LiveTranscriptHandlers | null = null
let lastHandle: { stop: ReturnType<typeof vi.fn> } | null = null

beforeEach(() => {
  startMock.mockReset()
  lastHandlers = null
  lastHandle = null
  startMock.mockImplementation((handlers) => {
    lastHandlers = handlers
    lastHandle = { stop: vi.fn() }
    return { ok: true, value: lastHandle satisfies SpeechHandle }
  })
})

afterEach(() => {
  cleanup()
})

describe('useTranscription', () => {
  it('seeds transcriptSegments from initialSegments', () => {
    const { result } = renderHook(() =>
      useTranscription({
        initialSegments: [{ id: 's1', text: 'hi', confidence: 0.5, finalizedAt: 1 }],
      }),
    )
    expect(result.current.state.transcriptSegments).toHaveLength(1)
    expect(result.current.state.partialTranscript).toBe('')
    expect(result.current.state.transcriptionActive).toBe(false)
  })

  it('begin() starts the engine and marks transcription active', () => {
    const { result } = renderHook(() => useTranscription())

    act(() => result.current.actions.begin())
    expect(startMock).toHaveBeenCalledTimes(1)
    expect(result.current.state.transcriptionActive).toBe(true)
  })

  it('teardown() stops the engine and clears active', () => {
    const { result } = renderHook(() => useTranscription())
    act(() => result.current.actions.begin())

    act(() => result.current.actions.teardown())
    expect(lastHandle?.stop).toHaveBeenCalled()
    expect(result.current.state.transcriptionActive).toBe(false)
  })

  it('forwards partial transcripts and finalized segments from the engine', () => {
    const { result } = renderHook(() => useTranscription())
    act(() => result.current.actions.begin())

    act(() => lastHandlers?.onPartial('hello'))
    expect(result.current.state.partialTranscript).toBe('hello')

    act(() => lastHandlers?.onFinal('hello world', 0.9))
    expect(result.current.state.partialTranscript).toBe('')
    expect(result.current.state.transcriptSegments.at(-1)?.text).toBe('hello world')
  })

  it('resetForNewTake() clears segments and partial transcript', () => {
    const { result } = renderHook(() =>
      useTranscription({
        initialSegments: [{ id: 's1', text: 'hi', confidence: 1, finalizedAt: 1 }],
      }),
    )
    act(() => result.current.actions.begin())
    act(() => lastHandlers?.onPartial('typing'))

    act(() => result.current.actions.resetForNewTake())

    expect(result.current.state.transcriptSegments).toHaveLength(0)
    expect(result.current.state.partialTranscript).toBe('')
  })

  it('flushPartialAsFinal() promotes any in-flight partial to a final segment', () => {
    const { result } = renderHook(() => useTranscription())
    act(() => result.current.actions.begin())
    act(() => lastHandlers?.onPartial('almost there'))

    act(() => result.current.actions.flushPartialAsFinal())

    expect(result.current.state.partialTranscript).toBe('')
    const last = result.current.state.transcriptSegments.at(-1)
    expect(last?.text).toBe('almost there')
    expect(last?.confidence).toBe(0)
  })

  it('flushPartialAsFinal() is a no-op when there is no partial', () => {
    const { result } = renderHook(() => useTranscription())
    act(() => result.current.actions.begin())

    act(() => result.current.actions.flushPartialAsFinal())
    expect(result.current.state.transcriptSegments).toHaveLength(0)
  })

  it('records engine errors and clears active', () => {
    const { result } = renderHook(() => useTranscription())
    act(() => result.current.actions.begin())

    act(() => lastHandlers?.onError({ code: 'speech', message: 'denied' }))

    expect(result.current.state.transcriptionError?.code).toBe('speech')
    expect(result.current.state.transcriptionActive).toBe(false)
  })

  it('records a startup failure when the service refuses to start', () => {
    startMock.mockReturnValueOnce({
      ok: false,
      error: { code: 'unsupported', message: 'no SR' },
    })
    const { result } = renderHook(() => useTranscription())

    act(() => result.current.actions.begin())

    expect(result.current.state.transcriptionError?.code).toBe('unsupported')
    expect(result.current.state.transcriptionActive).toBe(false)
  })

  it('begin() is idempotent while a session is active', () => {
    const { result } = renderHook(() => useTranscription())
    act(() => result.current.actions.begin())
    act(() => result.current.actions.begin())
    expect(startMock).toHaveBeenCalledTimes(1)
  })
})
