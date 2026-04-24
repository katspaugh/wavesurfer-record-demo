/** Handles MP3 export limits and worker-based blob conversion. */
import { MAX_EXPORT_DURATION_MS } from '../lib/audio'
import type { Mp3ExportSettings } from './mp3EncoderCore'

type EncoderMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; error: string }

const WORKER_PROGRESS_START = 0.04
const WORKER_PROGRESS_RANGE = 0.94

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

  onProgress(WORKER_PROGRESS_START)

  const worker = new Worker(new URL('../workers/mp3Encoder.worker.ts', import.meta.url), { type: 'module' })

  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<EncoderMessage>) => {
        if (event.data.type === 'progress') {
          onProgress(WORKER_PROGRESS_START + event.data.progress * WORKER_PROGRESS_RANGE)
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
      worker.postMessage({ recordedBlob, settings })
    })
  } finally {
    worker.terminate()
  }
}
