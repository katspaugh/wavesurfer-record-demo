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

function copyChunkToArrayBuffer(chunk: Uint8Array) {
  const buffer = new ArrayBuffer(chunk.byteLength)
  new Uint8Array(buffer).set(chunk)
  return buffer
}

export function createExportChannels(channels: Float32Array[], channelCount: Mp3ChannelCount) {
  const primary = channels[0]
  if (!primary) {
    throw new Error('No PCM channels were available for MP3 encoding.')
  }

  if (channelCount === 2) {
    return [primary, channels[1] ?? primary]
  }

  const channelLength = primary.length
  const mixed = new Float32Array(channelLength)
  const sourceChannels = channels.filter((channel) => channel.length > 0)

  for (const channel of sourceChannels) {
    for (let sampleIndex = 0; sampleIndex < channelLength; sampleIndex += 1) {
      const previous = mixed[sampleIndex] ?? 0
      mixed[sampleIndex] = previous + (channel[sampleIndex] ?? 0) / sourceChannels.length
    }
  }

  return [mixed]
}

export async function encodePcmToMp3Blob(
  { channels, sampleRate, settings }: EncodePcmRequest,
  onProgress: (progress: number) => void,
) {
  const encoder = await createMp3Encoder()
  const exportChannels = createExportChannels(channels, settings.channelCount)
  const leadChannel = exportChannels[0]
  if (!leadChannel) {
    throw new Error('No PCM channels were available for MP3 encoding.')
  }
  const blockSize = 1152
  const mp3Chunks: ArrayBuffer[] = []

  encoder.configure({
    bitrate: settings.bitRate,
    channels: settings.channelCount,
    sampleRate,
  })

  for (let offset = 0; offset < leadChannel.length; offset += blockSize) {
    const encoded = encoder.encode(exportChannels.map((channel) => channel.subarray(offset, offset + blockSize)))

    if (encoded.length > 0) {
      mp3Chunks.push(copyChunkToArrayBuffer(encoded))
    }

    if (offset % (blockSize * 64) === 0) {
      onProgress(Math.min(0.98, offset / leadChannel.length))
    }
  }

  const finalChunk = encoder.finalize()
  if (finalChunk.length > 0) {
    mp3Chunks.push(copyChunkToArrayBuffer(finalChunk))
  }

  return new Blob(mp3Chunks, { type: 'audio/mpeg' })
}
