import { registerMp3Encoder } from '@mediabunny/mp3-encoder'
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp3OutputFormat,
  Output,
  canEncodeAudio,
} from 'mediabunny'
import type { Mp3ExportSettings } from '../services/mp3EncoderCore'

type EncodeMp3Request = {
  recordedBlob: Blob
  settings: Mp3ExportSettings
}

let registeredMp3Encoder = false

async function ensureMp3Encoder() {
  if (!registeredMp3Encoder && !(await canEncodeAudio('mp3'))) {
    registerMp3Encoder()
    registeredMp3Encoder = true
  }
}

function getConversionError(conversion: Conversion) {
  const reasons = conversion.discardedTracks
    .map(({ reason, track }) => `${track.type} track ${track.number}: ${reason}`)
    .join('; ')

  return reasons
    ? `This environment cannot convert the recording to MP3. ${reasons}.`
    : 'This environment cannot convert the recording to MP3.'
}

async function encodeMp3WithMediabunny(
  { recordedBlob, settings }: EncodeMp3Request,
  onProgress: (progress: number) => void,
) {
  await ensureMp3Encoder()

  const input = new Input({
    source: new BlobSource(recordedBlob),
    formats: ALL_FORMATS,
  })
  const target = new BufferTarget()
  const output = new Output({
    format: new Mp3OutputFormat(),
    target,
  })

  try {
    const conversion = await Conversion.init({
      audio: {
        bitrate: settings.bitRate * 1000,
        codec: 'mp3',
        forceTranscode: true,
        numberOfChannels: settings.channelCount,
      },
      input,
      output,
      showWarnings: false,
      tags: {},
      video: { discard: true },
    })

    if (!conversion.isValid) {
      throw new Error(getConversionError(conversion))
    }

    conversion.onProgress = onProgress
    await conversion.execute()

    if (!target.buffer) {
      throw new Error('MP3 encoding did not produce an output file.')
    }

    return new Blob([target.buffer], { type: 'audio/mpeg' })
  } finally {
    input.dispose()
  }
}

self.onmessage = async (event: MessageEvent<EncodeMp3Request>) => {
  try {
    const blob = await encodeMp3WithMediabunny(event.data, (progress) => {
      self.postMessage({ type: 'progress', progress })
    })
    self.postMessage({ type: 'done', blob })
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'MP3 encoding failed.',
    })
  }
}
