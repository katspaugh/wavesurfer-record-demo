import { encodePcmToMp3Blob, type EncodePcmRequest } from '../services/mp3EncoderCore'

self.onmessage = async (event: MessageEvent<EncodePcmRequest>) => {
  try {
    const blob = await encodePcmToMp3Blob(event.data, (progress) => {
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
