import { type Dispatch, useCallback, useEffect, useRef } from 'react'
import {
  createTranscriptSegments,
  createTranscriptResult,
  extractSpeechRecognitionText,
  getSpeechRecognitionConstructor,
  getSpeechRecognitionErrorMessage,
  isRecoverableSpeechRecognitionError,
  MIN_TRANSCRIPT_PHRASE_DURATION_MS,
  type BrowserSpeechRecognition,
} from '../services/speechRecognitionService'
import type { RecorderAction } from '../state/recorderReducer'
import type { RecordingSession, TranscriptSegment } from '../types'

type UseLiveTranscriptionOptions = {
  commitSessionUpdate: (patch: Partial<RecordingSession>) => Promise<void>
  dispatch: Dispatch<RecorderAction>
  getElapsedMs: () => number
  onTranscriptSegmentsChange: (segments: TranscriptSegment[]) => void
}

export function useLiveTranscription({
  commitSessionUpdate,
  dispatch,
  getElapsedMs,
  onTranscriptSegmentsChange,
}: UseLiveTranscriptionOptions) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const restartTimeoutRef = useRef<number | null>(null)
  const shouldListenRef = useRef(false)
  const transcriptTextRef = useRef('')
  const transcriptConfidenceRef = useRef(0)
  const transcriptSegmentsRef = useRef<TranscriptSegment[]>([])
  const pendingSpeechStartMsRef = useRef<number | null>(null)

  const clearRestartTimer = useCallback(() => {
    if (restartTimeoutRef.current === null) return
    window.clearTimeout(restartTimeoutRef.current)
    restartTimeoutRef.current = null
  }, [])

  const stopLiveTranscription = useCallback(() => {
    shouldListenRef.current = false
    clearRestartTimer()
    const recognition = recognitionRef.current
    recognitionRef.current = null
    pendingSpeechStartMsRef.current = null
    recognition?.stop()
    dispatch({ type: 'set-transcribing', isTranscribing: false })
  }, [clearRestartTimer, dispatch])

  const resetLiveTranscription = useCallback(() => {
    stopLiveTranscription()
    transcriptTextRef.current = ''
    transcriptConfidenceRef.current = 0
    transcriptSegmentsRef.current = []
    onTranscriptSegmentsChange([])
  }, [onTranscriptSegmentsChange, stopLiveTranscription])

  const setTranscriptBaseline = useCallback((text: string, confidence: number, segments: TranscriptSegment[] = []) => {
    transcriptTextRef.current = text
    transcriptConfidenceRef.current = confidence
    transcriptSegmentsRef.current = segments
    pendingSpeechStartMsRef.current = null
    onTranscriptSegmentsChange(segments)
  }, [onTranscriptSegmentsChange])

  const startLiveTranscription = useCallback(() => {
    if (shouldListenRef.current || recognitionRef.current) return

    const Recognition = getSpeechRecognitionConstructor(window)
    if (!Recognition) {
      dispatch({ type: 'set-error', error: 'Live speech recognition is not available in this browser.' })
      return
    }

    shouldListenRef.current = true
    dispatch({ type: 'set-transcribing', isTranscribing: true })
    dispatch({ type: 'set-error', error: null })

    const startRecognition = () => {
      if (!shouldListenRef.current) return

      clearRestartTimer()
      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = navigator.language || 'en-US'
      recognitionRef.current = recognition

      recognition.onresult = (event) => {
        const nextSpeech = extractSpeechRecognitionText(event)
        const elapsedMs = getElapsedMs()
        const parts = [transcriptTextRef.current, nextSpeech.finalText, nextSpeech.interimText].filter(Boolean)
        const text = parts.join(' ').trim()
        if (!text) return

        if (nextSpeech.finalText) {
          const lastSegment = transcriptSegmentsRef.current.at(-1)
          const estimatedStartMs = Math.max(
            lastSegment?.endMs ?? 0,
            elapsedMs - Math.max(
              MIN_TRANSCRIPT_PHRASE_DURATION_MS,
              nextSpeech.finalText.split(/\s+/u).filter(Boolean).length * 350,
            ),
          )
          const finalSegments = createTranscriptSegments({
            confidence: nextSpeech.confidence || transcriptConfidenceRef.current,
            endMs: elapsedMs,
            idFactory: () => crypto.randomUUID(),
            startMs: pendingSpeechStartMsRef.current ?? estimatedStartMs,
            text: nextSpeech.finalText,
          })
          transcriptTextRef.current = [transcriptTextRef.current, nextSpeech.finalText].filter(Boolean).join(' ').trim()
          transcriptConfidenceRef.current = nextSpeech.confidence
          transcriptSegmentsRef.current = [...transcriptSegmentsRef.current, ...finalSegments]
          pendingSpeechStartMsRef.current = nextSpeech.interimText ? elapsedMs : null
          onTranscriptSegmentsChange(transcriptSegmentsRef.current)
        } else if (nextSpeech.interimText && pendingSpeechStartMsRef.current === null) {
          if (pendingSpeechStartMsRef.current === null) pendingSpeechStartMsRef.current = elapsedMs
        }

        const transcript = createTranscriptResult({
          confidence: nextSpeech.confidence || transcriptConfidenceRef.current,
          createdAt: Date.now(),
          id: crypto.randomUUID(),
          segments: transcriptSegmentsRef.current,
          text,
        })
        dispatch({ type: 'set-transcript', transcript })

        if (nextSpeech.finalText) {
          void commitSessionUpdate({ transcript })
        }
      }

      recognition.onerror = (event) => {
        if (isRecoverableSpeechRecognitionError(event.error) && shouldListenRef.current) {
          dispatch({ type: 'set-error', error: null })
          return
        }

        shouldListenRef.current = false
        clearRestartTimer()
        dispatch({ type: 'set-error', error: getSpeechRecognitionErrorMessage(event.error) })
        dispatch({ type: 'set-transcribing', isTranscribing: false })
        if (recognitionRef.current === recognition) recognitionRef.current = null
      }

      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null
        if (!shouldListenRef.current) {
          dispatch({ type: 'set-transcribing', isTranscribing: false })
          return
        }

        restartTimeoutRef.current = window.setTimeout(startRecognition, 250)
      }

      try {
        recognition.start()
      } catch (error) {
        shouldListenRef.current = false
        clearRestartTimer()
        dispatch({ type: 'set-error', error: error instanceof Error ? error.message : 'Live transcription could not start.' })
        dispatch({ type: 'set-transcribing', isTranscribing: false })
        if (recognitionRef.current === recognition) recognitionRef.current = null
      }
    }

    startRecognition()
  }, [
    clearRestartTimer,
    commitSessionUpdate,
    dispatch,
    getElapsedMs,
    onTranscriptSegmentsChange,
  ])

  useEffect(() => {
    return () => {
      shouldListenRef.current = false
      clearRestartTimer()
      pendingSpeechStartMsRef.current = null
      recognitionRef.current?.stop()
    }
  }, [clearRestartTimer])

  return {
    resetLiveTranscription,
    setTranscriptBaseline,
    startLiveTranscription,
    stopLiveTranscription,
  }
}
