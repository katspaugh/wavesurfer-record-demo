/** Provides session naming, patching, query-string, and async write queue helpers. */
import type { ChunkMetadata, RecordingSession } from '../types'

export const SESSION_QUERY_KEY = 'session'

export function getNextSessionTitle(sessionCount: number) {
  return `Session ${String(sessionCount + 1).padStart(2, '0')}`
}

export function createDraftSession({
  id,
  mimeType,
  now,
  sessionCount,
}: {
  id: string
  mimeType: string
  now: number
  sessionCount: number
}): RecordingSession {
  return {
    id,
    title: getNextSessionTitle(sessionCount),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    durationMs: 0,
    size: 0,
    mimeType: mimeType || 'browser default',
    chunkCount: 0,
  }
}

export function applySessionPatch(session: RecordingSession, patch: Partial<RecordingSession>, now: number): RecordingSession {
  return {
    ...session,
    ...patch,
    updatedAt: now,
  }
}

export function reconcileSessionStatus(session: RecordingSession, now: number, hasBlob: boolean): RecordingSession {
  if (session.status === 'recording') {
    return {
      ...session,
      status: hasBlob ? 'stopped' : 'paused',
      updatedAt: now,
    }
  }
  return session
}

export function getChunkBytes(chunks: ChunkMetadata[]) {
  return chunks.reduce((total, chunk) => total + chunk.size, 0)
}

export function setSessionQuery(sessionId: string | null, location: Location, history: History) {
  const params = new URLSearchParams(location.search)
  if (sessionId) {
    params.set(SESSION_QUERY_KEY, sessionId)
  } else {
    params.delete(SESSION_QUERY_KEY)
  }

  const nextQuery = params.toString()
  history.replaceState(null, '', `${location.pathname}${nextQuery ? `?${nextQuery}` : ''}`)
}

export function findSessionFromQuery(sessions: RecordingSession[], search: string) {
  const sessionId = new URLSearchParams(search).get(SESSION_QUERY_KEY)
  if (!sessionId) return null
  return sessions.find((session) => session.id === sessionId) ?? null
}

export type AsyncTask<T> = () => Promise<T>

export function createAsyncQueue() {
  let pending: Promise<unknown> = Promise.resolve()
  return <T>(task: AsyncTask<T>): Promise<T> => {
    const next = pending.then(task, task)
    pending = next.catch(() => undefined)
    return next
  }
}
