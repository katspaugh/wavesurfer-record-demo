/** getUserMedia + microphone device enumeration. All public APIs return Result. */
import { appError, err, fromThrown, ok, type AppError, type Result } from '../lib/result'

export type MicProcessingOption = 'echoCancellation' | 'noiseSuppression' | 'autoGainControl'
export type MicProcessing = Record<MicProcessingOption, boolean>

export const DEFAULT_MIC_PROCESSING: MicProcessing = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

export type MicDevice = {
  deviceId: string
  label: string
}

function hasMediaDevices(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

function classifyMediaError(cause: unknown): AppError {
  if (!(cause instanceof Error)) return appError('unknown', 'Microphone access failed.', cause)

  switch (cause.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return appError('permission-denied', 'Microphone permission was denied. Allow it in your browser settings, then try again.', cause)
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return appError('not-found', 'No microphone was found for this device.', cause)
    case 'NotReadableError':
    case 'TrackStartError':
      return appError('in-use', 'The microphone is unavailable right now. Close other apps using it, then try again.', cause)
    case 'AbortError':
      return appError('aborted', 'Microphone access was interrupted. Try again.', cause)
    default:
      return appError('unknown', cause.message || 'Microphone access failed.', cause)
  }
}

export async function listMicrophones(): Promise<Result<MicDevice[], AppError>> {
  if (!hasMediaDevices() || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
    return err(appError('unsupported', 'This browser cannot enumerate audio devices.'))
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const mics = devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      }))
    return ok(mics)
  } catch (cause) {
    return err(fromThrown(cause, 'Could not list audio inputs.'))
  }
}

export type RequestMicOptions = {
  deviceId?: string | undefined
  processing: MicProcessing
}

export async function requestMicrophoneStream(
  options: RequestMicOptions,
): Promise<Result<MediaStream, AppError>> {
  if (!hasMediaDevices()) {
    return err(appError('unsupported', 'This browser does not support microphone recording.'))
  }

  const audio: MediaTrackConstraints = {
    autoGainControl: options.processing.autoGainControl,
    echoCancellation: options.processing.echoCancellation,
    noiseSuppression: options.processing.noiseSuppression,
  }
  if (options.deviceId) audio.deviceId = { exact: options.deviceId }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio })
    return ok(stream)
  } catch (cause) {
    return err(classifyMediaError(cause))
  }
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return
  for (const track of stream.getTracks()) track.stop()
}
