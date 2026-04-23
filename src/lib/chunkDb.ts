/** Persists recording metadata, chunks, and finalized blobs in IndexedDB. */
import type { ChunkMetadata, QueueStats, RecordingSession, StoredChunk } from '../types'

function toChunkMetadata(chunk: StoredChunk): ChunkMetadata {
  return {
    id: chunk.id,
    sessionId: chunk.sessionId,
    sequence: chunk.sequence,
    createdAt: chunk.createdAt,
    size: chunk.size,
    type: chunk.type,
  }
}

const DB_NAME = 'field-recorder'
const DB_VERSION = 3
const CHUNKS_STORE = 'chunks'
const SESSIONS_STORE = 'sessions'
const SESSION_BLOBS_STORE = 'session_blobs'

type SessionBlobRecord = {
  sessionId: string
  blob: Blob
}

type StoreName = typeof CHUNKS_STORE | typeof SESSIONS_STORE | typeof SESSION_BLOBS_STORE

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase() {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      const upgradeTransaction = request.transaction

      if (!database.objectStoreNames.contains(CHUNKS_STORE)) {
        const store = database.createObjectStore(CHUNKS_STORE, { keyPath: 'id' })
        store.createIndex('sessionId', 'sessionId', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }

      if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = database.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }

      if (!database.objectStoreNames.contains(SESSION_BLOBS_STORE)) {
        database.createObjectStore(SESSION_BLOBS_STORE, { keyPath: 'sessionId' })

        if (upgradeTransaction) {
          const sessionsStore = upgradeTransaction.objectStore(SESSIONS_STORE)
          const blobsStore = upgradeTransaction.objectStore(SESSION_BLOBS_STORE)
          const cursorRequest = sessionsStore.openCursor()

          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) return
            const legacy = cursor.value as RecordingSession & { blob?: Blob }
            if (legacy.blob) {
              blobsStore.put({ sessionId: legacy.id, blob: legacy.blob })
              const { blob: _discarded, ...metadata } = legacy
              cursor.update(metadata)
            }
            cursor.continue()
          }
        }
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return databasePromise
}

async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase()

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    let result!: T

    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new DOMException('IndexedDB transaction aborted.', 'AbortError'))
  })
}

export async function saveChunk(chunk: StoredChunk) {
  await withStore(CHUNKS_STORE, 'readwrite', (store) => store.put(chunk))
}

export async function listChunks() {
  const chunks = await withStore<StoredChunk[]>(CHUNKS_STORE, 'readonly', (store) => store.getAll())
  return chunks.sort((a, b) => a.createdAt - b.createdAt || a.sequence - b.sequence)
}

export async function deleteChunk(id: string) {
  await withStore(CHUNKS_STORE, 'readwrite', (store) => store.delete(id))
}

export async function deleteChunksForSession(sessionId: string) {
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CHUNKS_STORE, 'readwrite')
    const store = transaction.objectStore(CHUNKS_STORE)
    const cursorRequest = store.index('sessionId').openKeyCursor(IDBKeyRange.only(sessionId))

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return
      store.delete(cursor.primaryKey)
      cursor.continue()
    }
    cursorRequest.onerror = () => reject(cursorRequest.error)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function clearChunks() {
  await withStore(CHUNKS_STORE, 'readwrite', (store) => store.clear())
}

export async function getQueueStats(): Promise<QueueStats> {
  const database = await openDatabase()

  return new Promise<QueueStats>((resolve, reject) => {
    const transaction = database.transaction(CHUNKS_STORE, 'readonly')
    const store = transaction.objectStore(CHUNKS_STORE)
    const cursorRequest = store.openCursor()
    const sessions = new Set<string>()
    let chunks = 0
    let bytes = 0

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return
      const value = cursor.value as StoredChunk
      chunks += 1
      bytes += value.size
      sessions.add(value.sessionId)
      cursor.continue()
    }
    cursorRequest.onerror = () => reject(cursorRequest.error)
    transaction.oncomplete = () => resolve({ chunks, bytes, sessions: sessions.size })
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function listChunkMetadataForSession(sessionId: string): Promise<ChunkMetadata[]> {
  const database = await openDatabase()

  return new Promise<ChunkMetadata[]>((resolve, reject) => {
    const transaction = database.transaction(CHUNKS_STORE, 'readonly')
    const store = transaction.objectStore(CHUNKS_STORE)
    const cursorRequest = store.index('sessionId').openCursor(IDBKeyRange.only(sessionId))
    const out: ChunkMetadata[] = []

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return
      out.push(toChunkMetadata(cursor.value as StoredChunk))
      cursor.continue()
    }
    cursorRequest.onerror = () => reject(cursorRequest.error)
    transaction.oncomplete = () => {
      out.sort((a, b) => a.sequence - b.sequence || a.createdAt - b.createdAt)
      resolve(out)
    }
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function listStoredChunksForSession(sessionId: string): Promise<StoredChunk[]> {
  const database = await openDatabase()

  return new Promise<StoredChunk[]>((resolve, reject) => {
    const transaction = database.transaction(CHUNKS_STORE, 'readonly')
    const store = transaction.objectStore(CHUNKS_STORE)
    const cursorRequest = store.index('sessionId').openCursor(IDBKeyRange.only(sessionId))
    const out: StoredChunk[] = []

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return
      out.push(cursor.value as StoredChunk)
      cursor.continue()
    }
    cursorRequest.onerror = () => reject(cursorRequest.error)
    transaction.oncomplete = () => {
      out.sort((a, b) => a.sequence - b.sequence || a.createdAt - b.createdAt)
      resolve(out)
    }
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function saveSession(session: RecordingSession) {
  await withStore(SESSIONS_STORE, 'readwrite', (store) => store.put(session))
}

export async function listSessions() {
  const sessions = await withStore<RecordingSession[]>(SESSIONS_STORE, 'readonly', (store) => store.getAll())
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteSession(id: string) {
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([SESSIONS_STORE, SESSION_BLOBS_STORE], 'readwrite')
    transaction.objectStore(SESSIONS_STORE).delete(id)
    transaction.objectStore(SESSION_BLOBS_STORE).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function saveSessionBlob(sessionId: string, blob: Blob) {
  const record: SessionBlobRecord = { sessionId, blob }
  await withStore(SESSION_BLOBS_STORE, 'readwrite', (store) => store.put(record))
}

export async function getSessionBlob(sessionId: string): Promise<Blob | null> {
  const record = await withStore<SessionBlobRecord | undefined>(
    SESSION_BLOBS_STORE,
    'readonly',
    (store) => store.get(sessionId),
  )
  return record?.blob ?? null
}

export async function deleteSessionBlob(sessionId: string) {
  await withStore(SESSION_BLOBS_STORE, 'readwrite', (store) => store.delete(sessionId))
}
