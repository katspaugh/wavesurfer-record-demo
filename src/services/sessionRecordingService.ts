/** Rebuilds, resets, and finalizes session recordings against IndexedDB-backed storage. */
import {
  deleteChunksForSession,
  deleteSessionBlob,
  getQueueStats,
  listChunkMetadataForSession,
  listStoredChunksForSession,
  saveSession,
  saveSessionBlob,
} from '../lib/chunkDb'
import { applySessionPatch } from './sessionService'
import type { ChunkMetadata, QueueStats, RecordingSession } from '../types'

export type SessionCacheState = {
  chunks: ChunkMetadata[]
  queueStats: QueueStats
}

export async function buildSessionBlobFromChunks(sessionId: string, fallbackBlob?: Blob | null) {
  const chunks = await listStoredChunksForSession(sessionId)
  if (chunks.length === 0) return fallbackBlob ?? null

  return new Blob(
    chunks.map((chunk) => chunk.blob),
    { type: chunks[0]?.type || fallbackBlob?.type || 'audio/webm' },
  )
}

async function getSessionCacheState(sessionId: string): Promise<SessionCacheState> {
  const [chunks, queueStats] = await Promise.all([
    listChunkMetadataForSession(sessionId),
    getQueueStats(),
  ])

  return { chunks, queueStats }
}

export async function prepareSessionForFreshRecording(session: RecordingSession, now = Date.now()) {
  await Promise.all([
    deleteChunksForSession(session.id),
    deleteSessionBlob(session.id),
  ])

  const { transcript: _discarded, ...sessionWithoutTranscript } = session
  const nextSession = applySessionPatch(sessionWithoutTranscript, {
    chunkCount: 0,
    durationMs: 0,
    size: 0,
    status: 'draft',
  }, now)

  await saveSession(nextSession)

  return {
    cacheState: await getSessionCacheState(session.id),
    session: nextSession,
  }
}

export async function persistFinalizedSession({
  blob,
  durationMs,
  mimeType,
  now = Date.now(),
  session,
}: {
  blob: Blob
  durationMs: number
  mimeType: string
  now?: number
  session: RecordingSession
}) {
  await saveSessionBlob(session.id, blob)
  await deleteChunksForSession(session.id)

  const nextSession = applySessionPatch(session, {
    chunkCount: 0,
    durationMs,
    mimeType,
    size: blob.size,
    status: 'stopped',
  }, now)

  await saveSession(nextSession)

  return {
    cacheState: await getSessionCacheState(session.id),
    session: nextSession,
  }
}
