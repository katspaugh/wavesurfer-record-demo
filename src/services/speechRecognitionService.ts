/** Browser SpeechRecognition wrapper with Result-based start. */
import { appError, err, fromThrown, ok, type AppError, type Result } from '../lib/result'

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

export type SpeechRecognitionErrorEvent = { error: string }
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

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition

export function getSpeechRecognitionConstructor(win: Window): SpeechRecognitionConstructor | null {
  const candidate = win as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

export type LiveTranscriptHandlers = {
  onPartial: (text: string) => void
  onFinal: (text: string, confidence: number) => void
  onError: (error: AppError) => void
  onEnd: () => void
}

export type SpeechHandle = {
  stop: () => void
}

export function startLiveTranscription(handlers: LiveTranscriptHandlers): Result<SpeechHandle, AppError> {
  if (typeof window === 'undefined') {
    return err(appError('unsupported', 'Speech recognition requires a browser environment.'))
  }

  const Recognition = getSpeechRecognitionConstructor(window)
  if (!Recognition) {
    return err(appError('unsupported', 'Live speech recognition is not available in this browser.'))
  }

  let active = true
  let recognition: BrowserSpeechRecognition | null = null
  let restartTimer: number | null = null

  const clearRestart = () => {
    if (restartTimer !== null) {
      window.clearTimeout(restartTimer)
      restartTimer = null
    }
  }

  const spawn = () => {
    if (!active) return
    clearRestart()
    const next = new Recognition()
    next.continuous = true
    next.interimResults = true
    next.lang = navigator.language || 'en-US'
    recognition = next

    next.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index] ?? event.results.item(index)
        const alternative = result[0] ?? result.item(0)
        const transcript = alternative.transcript.trim()
        if (!transcript) continue
        if (result.isFinal) handlers.onFinal(transcript, alternative.confidence)
        else interim = [interim, transcript].filter(Boolean).join(' ')
      }
      if (interim) handlers.onPartial(interim)
    }

    next.onerror = (event) => {
      if (event.error === 'no-speech' && active) return
      active = false
      clearRestart()
      handlers.onError(appError('speech', describeSpeechError(event.error)))
    }

    next.onend = () => {
      if (!active) {
        handlers.onEnd()
        return
      }
      restartTimer = window.setTimeout(spawn, 250)
    }

    try {
      next.start()
    } catch (cause) {
      active = false
      clearRestart()
      handlers.onError(fromThrown(cause, 'Live transcription could not start.', 'speech'))
    }
  }

  spawn()

  return ok({
    stop: () => {
      active = false
      clearRestart()
      const current = recognition
      recognition = null
      try {
        current?.stop()
      } catch {
        // ignore - already stopping
      }
    },
  })
}

function describeSpeechError(error: string): string {
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
