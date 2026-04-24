/** Handles MP3 export limits, device-memory budget, and worker-based blob encoding. */
import { MAX_EXPORT_DURATION_MS } from '../lib/audio'
import type { Mp3ExportSettings } from './mp3EncoderCore'

type EncoderMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; error: string }

const DEFAULT_PCM_BYTE_BUDGET = 400 * 1024 * 1024
const WORST_CASE_SAMPLE_RATE = 48_000
const WORST_CASE_CHANNELS = 2
const BYTES_PER_SAMPLE = 4

function formatMaxMinutes() {
  return Math.round(MAX_EXPORT_DURATION_MS / 60_000)
}

function formatMb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

function estimateWorstCasePcmBytes(durationMs: number) {
  return Math.ceil((durationMs / 1000) * WORST_CASE_SAMPLE_RATE * WORST_CASE_CHANNELS * BYTES_PER_SAMPLE)
}

function getPcmByteBudget() {
  const deviceMemoryGb = (navigator as { deviceMemory?: number }).deviceMemory
  if (typeof deviceMemoryGb === 'number' && deviceMemoryGb > 0) {
    // Budget ~12% of advertised device memory, never above the hard cap.
    return Math.min(deviceMemoryGb * 1024 * 1024 * 1024 * 0.12, DEFAULT_PCM_BYTE_BUDGET)
  }
  return DEFAULT_PCM_BYTE_BUDGET
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

  const worstCasePcmBytes = estimateWorstCasePcmBytes(durationMs)
  const budget = getPcmByteBudget()
  if (worstCasePcmBytes > budget) {
    throw new Error(
      `This recording is too long to export on this device — decoding would need about ${formatMb(worstCasePcmBytes)} of memory. Trim the recording and try again.`,
    )
  }

  const arrayBuffer = await recordedBlob.arrayBuffer()
  onProgress(0.06)

  const worker = new Worker(new URL('../workers/mp3Encoder.worker.ts', import.meta.url), { type: 'module' })

  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<EncoderMessage>) => {
        if (event.data.type === 'progress') {
          onProgress(0.06 + event.data.progress * 0.9)
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
      worker.postMessage({ arrayBuffer, settings }, [arrayBuffer])
    })
  } finally {
    worker.terminate()
  }
}
