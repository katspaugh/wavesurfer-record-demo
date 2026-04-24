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
const DECODE_PROGRESS = 0.14
const ENCODE_PROGRESS_RANGE = 0.84

type AudioDecoderContext = {
  close?: () => Promise<void>
  decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer>
}

type AudioContextConstructor = new () => AudioDecoderContext
type OfflineAudioContextConstructor = new (
  numberOfChannels: number,
  length: number,
  sampleRate: number
) => AudioDecoderContext

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

function createDecodeContext(): AudioDecoderContext {
  const audioGlobal = globalThis as {
    AudioContext?: AudioContextConstructor
    OfflineAudioContext?: OfflineAudioContextConstructor
    webkitAudioContext?: AudioContextConstructor
    webkitOfflineAudioContext?: OfflineAudioContextConstructor
  }

  const AudioContextCtor = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext
  if (AudioContextCtor) {
    return new AudioContextCtor()
  }

  const OfflineAudioContextCtor = audioGlobal.OfflineAudioContext ?? audioGlobal.webkitOfflineAudioContext
  if (OfflineAudioContextCtor) {
    return new OfflineAudioContextCtor(1, 1, 44_100)
  }

  throw new Error('This environment cannot decode audio for MP3 export.')
}

async function decodeRecordedAudio(arrayBuffer: ArrayBuffer) {
  const decodeContext = createDecodeContext()
  try {
    return await decodeContext.decodeAudioData(arrayBuffer)
  } catch {
    throw new Error('The recorded audio could not be decoded for MP3 export.')
  } finally {
    await decodeContext.close?.().catch(() => undefined)
  }
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

  const audioBuffer = await decodeRecordedAudio(arrayBuffer)
  onProgress(DECODE_PROGRESS)

  const channelCount = Math.min(audioBuffer.numberOfChannels, 2)
  const channels: Float32Array[] = []
  for (let index = 0; index < channelCount; index += 1) {
    channels.push(audioBuffer.getChannelData(index))
  }

  const worker = new Worker(new URL('../workers/mp3Encoder.worker.ts', import.meta.url), { type: 'module' })

  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<EncoderMessage>) => {
        if (event.data.type === 'progress') {
          onProgress(DECODE_PROGRESS + event.data.progress * ENCODE_PROGRESS_RANGE)
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
        { channels, sampleRate: audioBuffer.sampleRate, settings },
        channels.map((channel) => channel.buffer),
      )
    })
  } finally {
    worker.terminate()
  }
}
