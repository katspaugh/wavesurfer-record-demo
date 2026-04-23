import type { TranscriptResult, TranscriptSegment } from '../types'

export const MAX_TRANSCRIPT_SEGMENT_DURATION_MS = 4_500
export const MAX_TRANSCRIPT_SEGMENT_WORDS = 8
export const MIN_TRANSCRIPT_PHRASE_DURATION_MS = 650
const MIN_TRANSCRIPT_SEGMENT_DURATION_MS = 300

export type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition

export type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  start: () => void
  stop: () => void
}

export type SpeechRecognitionErrorEvent = {
  error: string
}

export type SpeechRecognitionEvent = {
  resultIndex: number
  results: SpeechRecognitionResultList
}

export type SpeechRecognitionResultList = {
  length: number
  item: (index: number) => SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

export type SpeechRecognitionResult = {
  isFinal: boolean
  length: number
  item: (index: number) => SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

export type SpeechRecognitionAlternative = {
  confidence: number
  transcript: string
}

export function getSpeechRecognitionConstructor(win: Window): SpeechRecognitionConstructor | null {
  const candidate = win as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }

  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

export function createTranscriptResult({
  confidence,
  createdAt,
  id,
  segments = [],
  text,
}: {
  confidence: number
  createdAt: number
  id: string
  segments?: TranscriptSegment[]
  text: string
}): TranscriptResult {
  return {
    id,
    text: text.trim(),
    confidence,
    createdAt,
    segments,
  }
}

export function createTranscriptSegments({
  confidence,
  endMs,
  idFactory,
  startMs,
  text,
}: {
  confidence: number
  endMs: number
  idFactory: () => string
  startMs: number
  text: string
}): TranscriptSegment[] {
  const words = text.trim().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return []

  const boundedEndMs = Math.max(0, endMs)
  const boundedStartMs = Math.max(0, Math.min(startMs, boundedEndMs - MIN_TRANSCRIPT_SEGMENT_DURATION_MS))
  const durationMs = Math.max(MIN_TRANSCRIPT_SEGMENT_DURATION_MS, boundedEndMs - boundedStartMs)
  const durationSegmentCount = Math.ceil(durationMs / MAX_TRANSCRIPT_SEGMENT_DURATION_MS)
  const wordSegmentCount = Math.ceil(words.length / MAX_TRANSCRIPT_SEGMENT_WORDS)
  const segmentCount = Math.max(1, Math.min(words.length, Math.max(durationSegmentCount, wordSegmentCount)))
  const segmentDurationMs = Math.max(
    MIN_TRANSCRIPT_SEGMENT_DURATION_MS,
    Math.min(MAX_TRANSCRIPT_SEGMENT_DURATION_MS, durationMs / segmentCount),
  )
  const segmentStartMs = Math.max(0, boundedEndMs - segmentDurationMs * segmentCount)
  const wordsPerSegment = Math.ceil(words.length / segmentCount)

  return Array.from({ length: segmentCount }, (_, index) => {
    const segmentWords = words.slice(index * wordsPerSegment, (index + 1) * wordsPerSegment)
    const start = segmentStartMs + segmentDurationMs * index
    const end = index === segmentCount - 1 ? boundedEndMs : segmentStartMs + segmentDurationMs * (index + 1)

    return {
      id: idFactory(),
      text: segmentWords.join(' '),
      confidence,
      startMs: Math.round(start),
      endMs: Math.round(Math.max(start + MIN_TRANSCRIPT_SEGMENT_DURATION_MS, end)),
    }
  }).filter((segment) => segment.text)
}

export function isRecoverableSpeechRecognitionError(error: string) {
  return error === 'no-speech'
}

export function getSpeechRecognitionErrorMessage(error: string) {
  switch (error) {
    case 'audio-capture':
      return 'Live transcription could not access microphone audio.'
    case 'language-not-supported':
      return 'Live transcription does not support the current browser language.'
    case 'network':
      return 'Live transcription lost its speech recognition network connection.'
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Live transcription permission was blocked.'
    default:
      return `Live transcription failed: ${error}.`
  }
}

export function extractSpeechRecognitionText(event: SpeechRecognitionEvent) {
  let finalText = ''
  let interimText = ''
  let confidenceTotal = 0
  let confidenceCount = 0

  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index] ?? event.results.item(index)
    const alternative = result[0] ?? result.item(0)
    const transcript = alternative.transcript.trim()
    if (!transcript) continue

    if (result.isFinal) {
      finalText = [finalText, transcript].filter(Boolean).join(' ')
      confidenceTotal += alternative.confidence
      confidenceCount += 1
    } else {
      interimText = [interimText, transcript].filter(Boolean).join(' ')
    }
  }

  return {
    confidence: confidenceCount > 0 ? confidenceTotal / confidenceCount : 0,
    finalText,
    interimText,
  }
}
