/** Creates persisted audio chunk records from MediaRecorder output. */
import type { StoredChunk } from '../types'

type MicrophoneConstraints = {
  autoGainControl: boolean
  echoCancellation: boolean
  noiseSuppression: boolean
}

export function createStoredChunk({
  blob,
  fallbackType,
  id,
  now,
  sequence,
  sessionId,
}: {
  blob: Blob
  fallbackType: string
  id: string
  now: number
  sequence: number
  sessionId: string
}): StoredChunk {
  return {
    id,
    sessionId,
    sequence,
    createdAt: now,
    size: blob.size,
    type: blob.type || fallbackType || 'audio/webm',
    blob,
  }
}

export async function requestMicrophoneAccess(constraints: MicrophoneConstraints) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support microphone recording.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function getRecordingStartErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Microphone access failed.'

  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Microphone permission was denied. Allow it in your browser settings, then try again.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found for this device.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The microphone is unavailable right now. Close other apps using it, then try again.'
    case 'AbortError':
      return 'Microphone access was interrupted. Try again.'
    default:
      return error.message || 'Microphone access failed.'
  }
}
