/** Single IndexedDB database for sessions metadata + their backing chunk rows. */
import { appError, err, fromThrown, ok, type AppError, type Result } from './result'
import type { TranscriptSegment } from '../types'

export type SessionMeta = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  durationMs: number
  size: number
  mimeType: string
  transcript: TranscriptSegment[]
  finalized: boolean
}

export type LoadedSession = SessionMeta & { blob: Blob }

export type StoredChunk = {
  id: string
  sessionId: string
  sequence: number
  createdAt: number
  size: number
  type: string
  blob: Blob
}

export type ChunkMetadata = Omit<StoredChunk, 'blob'>

export const DB_NAME = 'recording-sessions'
export const DB_VERSION = 3
export const SESSIONS_STORE = 'sessions'
export const CHUNKS_STORE = 'chunks'
const SESSION_INDEX = 'sessionId'

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      // Drop legacy stores that don't match the current shape.
      for (const name of Array.from(database.objectStoreNames)) {
        if (name !== SESSIONS_STORE && name !== CHUNKS_STORE) {
          database.deleteObjectStore(name)
        }
      }
      if (database.objectStoreNames.contains(CHUNKS_STORE)) {
        database.deleteObjectStore(CHUNKS_STORE)
      }
      if (database.objectStoreNames.contains(SESSIONS_STORE)) {
        database.deleteObjectStore(SESSIONS_STORE)
      }

      const sessionsStore = database.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
      sessionsStore.createIndex('createdAt', 'createdAt', { unique: false })

      const chunksStore = database.createObjectStore(CHUNKS_STORE, { keyPath: 'id' })
      chunksStore.createIndex(SESSION_INDEX, 'sessionId', { unique: false })
      chunksStore.createIndex('sequence', 'sequence', { unique: false })
      chunksStore.createIndex('createdAt', 'createdAt', { unique: false })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return databasePromise
}

type StoreName = typeof SESSIONS_STORE | typeof CHUNKS_STORE

async function withTransaction<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => Promise<T> | T,
): Promise<Result<T, AppError>> {
  try {
    const database = await openDatabase()
    return await new Promise<Result<T, AppError>>((resolve) => {
      const transaction = database.transaction(stores, mode)
      let outcome: T
      Promise.resolve(run(transaction))
        .then((value) => {
          outcome = value
        })
        .catch((cause: unknown) => resolve(err(fromThrown(cause, 'IndexedDB operation failed.', 'storage'))))
      transaction.oncomplete = () => resolve(ok(outcome))
      transaction.onerror = () => resolve(err(fromThrown(transaction.error, 'IndexedDB transaction failed.', 'storage')))
      transaction.onabort = () => resolve(err(appError('storage', 'IndexedDB transaction aborted.')))
    })
  } catch (cause) {
    return err(fromThrown(cause, 'IndexedDB is unavailable.', 'storage'))
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// --- chunks ---

export async function saveChunk(chunk: StoredChunk): Promise<Result<void, AppError>> {
  const result = await withTransaction(CHUNKS_STORE, 'readwrite', (transaction) => {
    transaction.objectStore(CHUNKS_STORE).put(chunk)
  })
  return result.ok ? ok(undefined) : result
}

export async function listChunksForSession(sessionId: string): Promise<Result<StoredChunk[], AppError>> {
  const result = await withTransaction(CHUNKS_STORE, 'readonly', async (transaction) => {
    const request = transaction.objectStore(CHUNKS_STORE)
      .index(SESSION_INDEX)
      .getAll(IDBKeyRange.only(sessionId)) as IDBRequest<StoredChunk[]>
    const rows = await requestToPromise(request)
    return [...rows].sort((a, b) => a.sequence - b.sequence || a.createdAt - b.createdAt)
  })
  return result
}

export async function clearChunksForSession(sessionId: string): Promise<Result<void, AppError>> {
  const result = await withTransaction(CHUNKS_STORE, 'readwrite', async (transaction) => {
    const store = transaction.objectStore(CHUNKS_STORE)
    const cursorRequest = store.index(SESSION_INDEX).openKeyCursor(IDBKeyRange.only(sessionId))
    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) {
          resolve()
          return
        }
        store.delete(cursor.primaryKey)
        cursor.continue()
      }
      cursorRequest.onerror = () => reject(cursorRequest.error)
    })
  })
  return result.ok ? ok(undefined) : result
}

export async function listChunkSessionIds(): Promise<Result<string[], AppError>> {
  return withTransaction(CHUNKS_STORE, 'readonly', async (transaction) => {
    const request = transaction.objectStore(CHUNKS_STORE).getAll() as IDBRequest<StoredChunk[]>
    const rows = await requestToPromise(request)
    const ids = new Set<string>()
    for (const chunk of rows) ids.add(chunk.sessionId)
    return [...ids]
  })
}

export type QueueSnapshot = {
  chunks: ChunkMetadata[]
  bytes: number
}

export async function getQueueSnapshotForSession(sessionId: string): Promise<Result<QueueSnapshot, AppError>> {
  const result = await listChunksForSession(sessionId)
  if (!result.ok) return result
  const metadata = result.value.map(({ blob: _blob, ...rest }) => rest)
  const bytes = metadata.reduce((total, chunk) => total + chunk.size, 0)
  return ok({ chunks: metadata, bytes })
}

// --- sessions ---

export async function createSession(meta: SessionMeta): Promise<Result<void, AppError>> {
  const result = await withTransaction(SESSIONS_STORE, 'readwrite', (transaction) => {
    transaction.objectStore(SESSIONS_STORE).put(meta)
  })
  return result.ok ? ok(undefined) : result
}

export async function finalizeSession(
  id: string,
  patch: Pick<SessionMeta, 'durationMs' | 'size' | 'mimeType' | 'transcript'>,
): Promise<Result<SessionMeta, AppError>> {
  return withTransaction(SESSIONS_STORE, 'readwrite', async (transaction) => {
    const store = transaction.objectStore(SESSIONS_STORE)
    const existing = await requestToPromise(store.get(id) as IDBRequest<SessionMeta | undefined>)
    if (!existing) throw new Error(`Session ${id} not found.`)
    const next: SessionMeta = {
      ...existing,
      ...patch,
      finalized: true,
      updatedAt: Date.now(),
    }
    store.put(next)
    return next
  })
}

export async function listSessions(): Promise<Result<SessionMeta[], AppError>> {
  return withTransaction(SESSIONS_STORE, 'readonly', async (transaction) => {
    const rows = await requestToPromise(transaction.objectStore(SESSIONS_STORE).getAll() as IDBRequest<SessionMeta[]>)
    return [...rows].sort((a, b) => b.createdAt - a.createdAt)
  })
}

export async function getSession(id: string): Promise<Result<SessionMeta | null, AppError>> {
  return withTransaction(SESSIONS_STORE, 'readonly', async (transaction) => {
    const meta = await requestToPromise(
      transaction.objectStore(SESSIONS_STORE).get(id) as IDBRequest<SessionMeta | undefined>,
    )
    return meta ?? null
  })
}

export async function loadSession(id: string): Promise<Result<LoadedSession | null, AppError>> {
  const meta = await getSession(id)
  if (!meta.ok) return meta
  if (!meta.value) return ok(null)
  const chunks = await listChunksForSession(id)
  if (!chunks.ok) return chunks
  const mimeType = chunks.value[0]?.type ?? meta.value.mimeType ?? 'audio/webm'
  const blob = new Blob(chunks.value.map((chunk) => chunk.blob), { type: mimeType })
  return ok({ ...meta.value, mimeType, blob })
}

export async function deleteSession(id: string): Promise<Result<void, AppError>> {
  const result = await withTransaction([SESSIONS_STORE, CHUNKS_STORE], 'readwrite', async (transaction) => {
    transaction.objectStore(SESSIONS_STORE).delete(id)
    const chunks = transaction.objectStore(CHUNKS_STORE)
    const cursorRequest = chunks.index(SESSION_INDEX).openKeyCursor(IDBKeyRange.only(id))
    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) {
          resolve()
          return
        }
        chunks.delete(cursor.primaryKey)
        cursor.continue()
      }
      cursorRequest.onerror = () => reject(cursorRequest.error)
    })
  })
  return result.ok ? ok(undefined) : result
}

// --- maintenance ---

export type ReconcileReport = {
  /** Chunks with no matching session, promoted into a draft session. */
  recovered: string[]
  /** Sessions in `finalized: false` state with no chunks, deleted as failed starts. */
  pruned: string[]
}

export async function reconcileSessions(): Promise<Result<ReconcileReport, AppError>> {
  const sessionsResult = await listSessions()
  if (!sessionsResult.ok) return sessionsResult
  const chunkIdsResult = await listChunkSessionIds()
  if (!chunkIdsResult.ok) return chunkIdsResult

  const knownSessionIds = new Set(sessionsResult.value.map((session) => session.id))
  const chunkSessionIds = new Set(chunkIdsResult.value)

  const recovered: string[] = []
  for (const orphanId of chunkSessionIds) {
    if (knownSessionIds.has(orphanId)) continue
    const chunks = await listChunksForSession(orphanId)
    if (!chunks.ok || chunks.value.length === 0) continue
    const mimeType = chunks.value[0]?.type ?? 'audio/webm'
    const size = chunks.value.reduce((total, chunk) => total + chunk.size, 0)
    const createdAt = chunks.value[0]?.createdAt ?? Date.now()
    const meta: SessionMeta = {
      id: orphanId,
      title: `Recovered recording — ${new Date(createdAt).toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
      })}`,
      createdAt,
      updatedAt: Date.now(),
      durationMs: 0,
      size,
      mimeType,
      transcript: [],
      finalized: false,
    }
    const created = await createSession(meta)
    if (created.ok) recovered.push(orphanId)
  }

  const pruned: string[] = []
  for (const session of sessionsResult.value) {
    if (session.finalized) continue
    if (chunkSessionIds.has(session.id)) continue
    const removed = await deleteSession(session.id)
    if (removed.ok) pruned.push(session.id)
  }

  return ok({ recovered, pruned })
}
