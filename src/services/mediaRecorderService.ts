/** Thin wrapper around MediaRecorder with Result-based start/pause/resume/stop. */
import { appError, err, fromThrown, ok, type AppError, type Result } from '../lib/result'

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

export const CHUNK_TIMESLICE_MS = 5_000

export function estimateChunkDurationMs(chunkCount: number): number {
  return chunkCount * CHUNK_TIMESLICE_MS
}

export function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export type RecorderHandlers = {
  onChunk: (blob: Blob, mimeType: string) => void
  onStateChange: (state: 'recording' | 'paused' | 'stopped' | 'inactive') => void
  onError: (error: AppError) => void
  onStop: (finalBlob: Blob, mimeType: string) => void
}

export type RecorderHandle = {
  pause: () => Result<void, AppError>
  resume: () => Result<void, AppError>
  stop: () => Result<void, AppError>
  state: () => 'recording' | 'paused' | 'stopped' | 'inactive'
  mimeType: string
}

export function startMediaRecorder(
  stream: MediaStream,
  handlers: RecorderHandlers,
  timesliceMs: number = CHUNK_TIMESLICE_MS,
): Result<RecorderHandle, AppError> {
  if (typeof MediaRecorder === 'undefined') {
    return err(appError('unsupported', 'MediaRecorder is not available in this browser.'))
  }

  const mimeType = pickSupportedMimeType()
  let recorder: MediaRecorder
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  } catch (cause) {
    return err(fromThrown(cause, 'MediaRecorder could not be created.', 'invalid-state'))
  }

  const collected: Blob[] = []
  const effectiveMime = recorder.mimeType || mimeType || 'audio/webm'

  recorder.ondataavailable = (event) => {
    if (!event.data || event.data.size === 0) return
    collected.push(event.data)
    handlers.onChunk(event.data, event.data.type || effectiveMime)
  }

  recorder.onerror = (event: Event) => {
    const candidate = event as Event & { error?: unknown }
    handlers.onError(fromThrown(candidate.error, 'MediaRecorder failed.', 'invalid-state'))
  }

  recorder.onstart = () => handlers.onStateChange('recording')
  recorder.onpause = () => handlers.onStateChange('paused')
  recorder.onresume = () => handlers.onStateChange('recording')
  recorder.onstop = () => {
    handlers.onStateChange('stopped')
    const finalBlob = new Blob(collected, { type: effectiveMime })
    handlers.onStop(finalBlob, effectiveMime)
  }

  try {
    recorder.start(timesliceMs)
  } catch (cause) {
    return err(fromThrown(cause, 'MediaRecorder failed to start.', 'invalid-state'))
  }

  const safeCall = (label: string, fn: () => void): Result<void, AppError> => {
    try {
      fn()
      return ok(undefined)
    } catch (cause) {
      return err(fromThrown(cause, `MediaRecorder ${label} failed.`, 'invalid-state'))
    }
  }

  return ok({
    pause: () => safeCall('pause', () => {
      if (recorder.state === 'recording') recorder.pause()
    }),
    resume: () => safeCall('resume', () => {
      if (recorder.state === 'paused') recorder.resume()
    }),
    stop: () => safeCall('stop', () => {
      if (recorder.state !== 'inactive') recorder.stop()
    }),
    state: () => recorder.state,
    mimeType: effectiveMime,
  })
}
