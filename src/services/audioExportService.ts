/** Handles MP3 export limits, audio decoding, and worker-based blob encoding. */
import { MAX_EXPORT_DURATION_MS, decodeBlobToPcm } from '../lib/audio'
import type { Mp3ExportSettings } from './mp3EncoderCore'

type EncoderMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; error: string }

function formatMaxMinutes() {
  return Math.round(MAX_EXPORT_DURATION_MS / 60_000)
}

export async function encodeMp3Blob(
  recordedBlob: Blob,
  settings: Mp3ExportSettings,
  durationMs: number,
  onProgress: (progress: number) => void,
) {
  if (durationMs > MAX_EXPORT_DURATION_MS) {
    throw new Error(
      `MP3 export is capped at ${formatMaxMinutes()} minutes in this build. Trim the recording before exporting.`,
    )
  }

  const decoded = await decodeBlobToPcm(recordedBlob)
  if (decoded.duration * 1000 > MAX_EXPORT_DURATION_MS) {
    throw new Error(
      `Decoded audio exceeds the ${formatMaxMinutes()}-minute export ceiling.`,
    )
  }
  onProgress(0.14)

  const worker = new Worker(new URL('../workers/mp3Encoder.worker.ts', import.meta.url), { type: 'module' })

  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<EncoderMessage>) => {
        if (event.data.type === 'progress') {
          onProgress(0.14 + event.data.progress * 0.82)
          return
        }

        if (event.data.type === 'error') {
          reject(new Error(event.data.error))
          return
        }

        resolve(event.data.blob)
      }

      worker.onerror = (event) => reject(new Error(event.message || 'MP3 worker failed during encoding.'))
      worker.onmessageerror = () => reject(new Error('MP3 worker returned an unreadable encoding result.'))
      worker.postMessage(
        { channels: decoded.channels, sampleRate: decoded.sampleRate, settings },
        decoded.channels.map((channel) => channel.buffer) as Transferable[],
      )
    })
  } finally {
    worker.terminate()
  }
}
