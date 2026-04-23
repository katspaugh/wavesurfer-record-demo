/** Centralizes audio format limits, display helpers, downloads, and blob decoding. */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

export const MAX_RECORDING_MS = 4 * 60 * 60 * 1000
export const CHUNK_TIMESLICE_MS = 10_000
export const MAX_EXPORT_DURATION_MS = 2 * 60 * 60 * 1000

export function getSupportedRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }

  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function decodeBlobToPcm(blob: Blob) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  const context = new AudioContextCtor()

  try {
    const arrayBuffer = await blob.arrayBuffer()
    const audioBuffer = await context.decodeAudioData(arrayBuffer)
    const channelCount = Math.min(audioBuffer.numberOfChannels, 2)
    const channels = Array.from({ length: channelCount }, (_, index) => {
      return new Float32Array(audioBuffer.getChannelData(index))
    })

    return {
      channels,
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
    }
  } finally {
    await context.close()
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
