/** Creates persisted audio chunk records from MediaRecorder output. */
import type { StoredChunk } from '../types'

export function createStoredChunk({
  blob,
  fallbackType,
  id,
  now,
  sequence,
  sessionId,
}: {
  blob: Blob
  fallbackType: string
  id: string
  now: number
  sequence: number
  sessionId: string
}): StoredChunk {
  return {
    id,
    sessionId,
    sequence,
    createdAt: now,
    size: blob.size,
    type: blob.type || fallbackType || 'audio/webm',
    blob,
  }
}
