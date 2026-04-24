/** Defines MP3 export settings and converts decoded PCM audio into an MP3 blob. */
import { createMp3Encoder } from 'wasm-media-encoders'

export type Mp3BitRate = 16 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 112 | 128 | 160 | 192 | 224 | 256 | 320
export type Mp3ChannelCount = 1 | 2

export type Mp3ExportSettings = {
  bitRate: Mp3BitRate
  channelCount: Mp3ChannelCount
}

export const MP3_BIT_RATES: Mp3BitRate[] = [16, 24, 32, 40, 48, 64, 96, 128, 160, 192, 256, 320]
export const DEFAULT_MP3_EXPORT_SETTINGS: Mp3ExportSettings = {
  bitRate: 32,
  channelCount: 1,
}

export type EncodePcmRequest = {
  channels: Float32Array[]
  sampleRate: number
  settings: Mp3ExportSettings
}

export type DecodeAndEncodeRequest = {
  arrayBuffer: ArrayBuffer
  settings: Mp3ExportSettings
}

const BLOCK_SIZE = 1152

function copyChunkToArrayBuffer(chunk: Uint8Array) {
  const buffer = new ArrayBuffer(chunk.byteLength)
  new Uint8Array(buffer).set(chunk)
  return buffer
}

export async function encodePcmToMp3Blob(
  { channels, sampleRate, settings }: EncodePcmRequest,
  onProgress: (progress: number) => void,
) {
  const sourceChannels = channels.filter((channel) => channel.length > 0)
  const primary = sourceChannels[0]
  if (!primary) {
    throw new Error('No PCM channels were available for MP3 encoding.')
  }

  const encoder = await createMp3Encoder()
  encoder.configure({
    bitrate: settings.bitRate,
    channels: settings.channelCount,
    sampleRate,
  })

  const mp3Chunks: ArrayBuffer[] = []
  const wantsMono = settings.channelCount === 1
  // Reused across iterations so a long mono export does not allocate a full-duration buffer.
  const monoScratch = wantsMono ? new Float32Array(BLOCK_SIZE) : null
  const mixFactor = sourceChannels.length > 0 ? 1 / sourceChannels.length : 1

  for (let offset = 0; offset < primary.length; offset += BLOCK_SIZE) {
    const end = Math.min(offset + BLOCK_SIZE, primary.length)
    const blockLength = end - offset

    let blockChannels: Float32Array[]
    if (wantsMono && monoScratch) {
      const mono = monoScratch.subarray(0, blockLength)
      mono.fill(0)
      for (const channel of sourceChannels) {
        const upper = Math.min(end, channel.length)
        for (let index = offset; index < upper; index += 1) {
          const localIndex = index - offset
          mono[localIndex] = (mono[localIndex] ?? 0) + (channel[index] ?? 0) * mixFactor
        }
      }
      blockChannels = [mono]
    } else {
      const left = primary.subarray(offset, end)
      const right = (sourceChannels[1] ?? primary).subarray(offset, end)
      blockChannels = [left, right]
    }

    const encoded = encoder.encode(blockChannels)
    if (encoded.length > 0) {
      mp3Chunks.push(copyChunkToArrayBuffer(encoded))
    }

    if (offset % (BLOCK_SIZE * 64) === 0) {
      onProgress(Math.min(0.98, offset / primary.length))
    }
  }

  const finalChunk = encoder.finalize()
  if (finalChunk.length > 0) {
    mp3Chunks.push(copyChunkToArrayBuffer(finalChunk))
  }

  return new Blob(mp3Chunks, { type: 'audio/mpeg' })
}

export async function decodeAndEncodeMp3Blob(
  { arrayBuffer, settings }: DecodeAndEncodeRequest,
  onProgress: (progress: number) => void,
) {
  const OfflineAudioContextCtor =
    (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext ??
    (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!OfflineAudioContextCtor) {
    throw new Error('This environment cannot decode audio for MP3 export.')
  }

  const decodeContext = new OfflineAudioContextCtor(1, 1, 44_100)
  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await decodeContext.decodeAudioData(arrayBuffer)
  } catch {
    throw new Error('The recorded audio could not be decoded for MP3 export.')
  }

  onProgress(0.12)

  const channelCount = Math.min(audioBuffer.numberOfChannels, 2)
  // getChannelData returns views into AudioBuffer-owned storage — feed them directly, no copy.
  const channels: Float32Array[] = []
  for (let index = 0; index < channelCount; index += 1) {
    channels.push(audioBuffer.getChannelData(index))
  }

  return encodePcmToMp3Blob(
    { channels, sampleRate: audioBuffer.sampleRate, settings },
    (innerProgress) => onProgress(0.12 + innerProgress * 0.86),
  )
}
