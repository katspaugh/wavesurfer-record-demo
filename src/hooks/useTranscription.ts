/** Live transcription slice: segments, in-flight partial, engine lifecycle. */
import { useCallback, useReducer, useRef } from 'react'
import { type AppError } from '../lib/result'
import { startLiveTranscription, type SpeechHandle } from '../services/speechRecognitionService'
import type { TranscriptSegment } from '../types'

export type TranscriptionState = {
  transcriptSegments: TranscriptSegment[]
  partialTranscript: string
  transcriptionActive: boolean
  transcriptionError: AppError | null
}

type Action =
  | { type: 'partial'; text: string }
  | { type: 'final-segment'; segment: TranscriptSegment }
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'error'; error: AppError }
  | { type: 'reset' }

function reduce(state: TranscriptionState, action: Action): TranscriptionState {
  switch (action.type) {
    case 'partial':
      return { ...state, partialTranscript: action.text }
    case 'final-segment':
      return {
        ...state,
        partialTranscript: '',
        transcriptSegments: [...state.transcriptSegments, action.segment],
      }
    case 'started':
      return { ...state, transcriptionActive: true, transcriptionError: null, partialTranscript: '' }
    case 'stopped':
      return { ...state, transcriptionActive: false }
    case 'error':
      return { ...state, transcriptionError: action.error, transcriptionActive: false }
    case 'reset':
      return { ...state, transcriptSegments: [], partialTranscript: '' }
  }
}

export type UseTranscriptionOptions = {
  initialSegments?: TranscriptSegment[]
}

export function useTranscription(options: UseTranscriptionOptions = {}) {
  const [state, dispatch] = useReducer(reduce, {
    transcriptSegments: options.initialSegments ?? [],
    partialTranscript: '',
    transcriptionActive: false,
    transcriptionError: null,
  })

  const handleRef = useRef<SpeechHandle | null>(null)
  // Mirror the partial transcript so flushPartialAsFinal can read the latest value
  // without depending on render-cycle state.
  const partialRef = useRef('')
  // Mirror segments so the composer's stop handler can read the freshly-flushed list
  // synchronously, before React has committed the dispatch.
  const segmentsRef = useRef<TranscriptSegment[]>(options.initialSegments ?? [])

  const begin = useCallback(() => {
    if (handleRef.current) return
    partialRef.current = ''
    const result = startLiveTranscription({
      onPartial: (text) => {
        partialRef.current = text
        dispatch({ type: 'partial', text })
      },
      onFinal: (text, confidence) => {
        partialRef.current = ''
        const segment: TranscriptSegment = {
          id: crypto.randomUUID(),
          text,
          confidence,
          finalizedAt: Date.now(),
        }
        segmentsRef.current = [...segmentsRef.current, segment]
        dispatch({ type: 'final-segment', segment })
      },
      onError: (error) => dispatch({ type: 'error', error }),
      onEnd: () => dispatch({ type: 'stopped' }),
    })
    if (result.ok) {
      handleRef.current = result.value
      dispatch({ type: 'started' })
    } else {
      dispatch({ type: 'error', error: result.error })
    }
  }, [])

  const teardown = useCallback(() => {
    handleRef.current?.stop()
    handleRef.current = null
    dispatch({ type: 'stopped' })
  }, [])

  const resetForNewTake = useCallback(() => {
    partialRef.current = ''
    segmentsRef.current = []
    dispatch({ type: 'reset' })
  }, [])

  const flushPartialAsFinal = useCallback(() => {
    const text = partialRef.current.trim()
    if (!text) return
    partialRef.current = ''
    const segment: TranscriptSegment = {
      id: crypto.randomUUID(),
      text,
      confidence: 0,
      finalizedAt: Date.now(),
    }
    segmentsRef.current = [...segmentsRef.current, segment]
    dispatch({ type: 'final-segment', segment })
  }, [])

  const getSegments = useCallback(() => segmentsRef.current, [])

  return {
    state,
    actions: { begin, teardown, resetForNewTake, flushPartialAsFinal, getSegments },
  }
}
