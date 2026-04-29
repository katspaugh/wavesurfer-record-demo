/** Drives MP3 encoding via a Web Worker and returns Result. */
import { appError, err, ok, type AppError, type Result } from '../lib/result'
import type { Mp3ExportSettings } from './mp3EncoderCore'

type EncoderMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; error: string }

export async function encodeMp3(
  recordedBlob: Blob,
  settings: Mp3ExportSettings,
  onProgress: (progress: number) => void,
): Promise<Result<Blob, AppError>> {
  if (recordedBlob.size === 0) {
    return err(appError('invalid-state', 'Cannot export an empty recording.'))
  }

  onProgress(0.04)

  const worker = new Worker(new URL('../workers/mp3Encoder.worker.ts', import.meta.url), { type: 'module' })

  try {
    return await new Promise<Result<Blob, AppError>>((resolve) => {
      worker.onmessage = (event: MessageEvent<EncoderMessage>) => {
        if (event.data.type === 'progress') {
          onProgress(0.04 + event.data.progress * 0.94)
          return
        }
        if (event.data.type === 'error') {
          resolve(err(appError('encoding', event.data.error)))
          return
        }
        onProgress(1)
        resolve(ok(event.data.blob))
      }
      worker.onerror = (event) => resolve(err(appError('encoding', event.message || 'MP3 worker failed during encoding.')))
      worker.onmessageerror = () => resolve(err(appError('encoding', 'MP3 worker returned an unreadable encoding result.')))
      worker.postMessage({ recordedBlob, settings })
    })
  } finally {
    worker.terminate()
  }
}
