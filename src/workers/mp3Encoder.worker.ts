import { decodeAndEncodeMp3Blob, type DecodeAndEncodeRequest } from '../services/mp3EncoderCore'

self.onmessage = async (event: MessageEvent<DecodeAndEncodeRequest>) => {
  try {
    const blob = await decodeAndEncodeMp3Blob(event.data, (progress) => {
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
