import { describe, expect, it } from 'vitest'
import {
  MAX_TRANSCRIPT_SEGMENT_DURATION_MS,
  MAX_TRANSCRIPT_SEGMENT_WORDS,
  MIN_TRANSCRIPT_PHRASE_DURATION_MS,
  createTranscriptSegments,
  createTranscriptResult,
  extractSpeechRecognitionText,
  getSpeechRecognitionConstructor,
  getSpeechRecognitionErrorMessage,
  isRecoverableSpeechRecognitionError,
  type BrowserSpeechRecognition,
  type SpeechRecognitionEvent,
  type SpeechRecognitionResult,
} from '../services/speechRecognitionService'

function result(transcript: string, confidence: number, isFinal: boolean): SpeechRecognitionResult {
  return {
    0: { transcript, confidence },
    isFinal,
    length: 1,
    item: () => ({ transcript, confidence }),
  }
}

describe('speechRecognitionService', () => {
  it('finds standard and webkit recognition constructors', () => {
    class Recognition implements BrowserSpeechRecognition {
      continuous = false
      interimResults = false
      lang = ''
      onend = null
      onerror = null
      onresult = null
      start() {}
      stop() {}
    }

    expect(getSpeechRecognitionConstructor({ SpeechRecognition: Recognition } as unknown as Window)).toBe(Recognition)
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: Recognition } as unknown as Window)).toBe(Recognition)
    expect(getSpeechRecognitionConstructor({} as Window)).toBeNull()
  })

  it('extracts final and interim speech text from recognition events', () => {
    const finalResult = result(' hello world ', 0.8, true)
    const interimResult = result(' still speaking ', 0, false)
    const event: SpeechRecognitionEvent = {
      resultIndex: 0,
      results: {
        0: finalResult,
        1: interimResult,
        length: 2,
        item: (index) => (index === 0 ? finalResult : interimResult),
      },
    }

    expect(extractSpeechRecognitionText(event)).toEqual({
      confidence: 0.8,
      finalText: 'hello world',
      interimText: 'still speaking',
    })
  })

  it('creates trimmed transcript results', () => {
    expect(createTranscriptResult({
      confidence: 0.75,
      createdAt: 123,
      id: 'transcript-1',
      text: ' hello ',
    })).toEqual({
      confidence: 0.75,
      createdAt: 123,
      id: 'transcript-1',
      segments: [],
      text: 'hello',
    })
  })

  it('splits transcript text into bounded waveform segments', () => {
    let id = 0
    const segments = createTranscriptSegments({
      confidence: 0.81,
      endMs: 12_000,
      idFactory: () => `segment-${id += 1}`,
      startMs: 0,
      text: Array.from({ length: MAX_TRANSCRIPT_SEGMENT_WORDS + 5 }, (_, index) => `word${index}`).join(' '),
    })

    expect(segments.length).toBeGreaterThan(1)
    expect(segments.map((segment) => segment.text.split(' ').length).every((count) => count <= MAX_TRANSCRIPT_SEGMENT_WORDS)).toBe(true)
    expect(segments.every((segment) => segment.endMs - segment.startMs <= MAX_TRANSCRIPT_SEGMENT_DURATION_MS)).toBe(true)
    expect(segments.at(-1)?.endMs).toBe(12_000)
  })

  it('keeps the phrase duration floor short enough for brief pauses', () => {
    expect(MIN_TRANSCRIPT_PHRASE_DURATION_MS).toBe(650)
  })

  it('classifies silence as recoverable and formats fatal errors', () => {
    expect(isRecoverableSpeechRecognitionError('no-speech')).toBe(true)
    expect(isRecoverableSpeechRecognitionError('network')).toBe(false)
    expect(getSpeechRecognitionErrorMessage('network')).toBe(
      'Live transcription lost its speech recognition network connection.',
    )
    expect(getSpeechRecognitionErrorMessage('not-allowed')).toBe('Live transcription permission was blocked.')
    expect(getSpeechRecognitionErrorMessage('unknown')).toBe('Live transcription failed: unknown.')
  })
})
