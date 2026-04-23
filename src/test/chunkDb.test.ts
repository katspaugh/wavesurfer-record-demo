import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearChunks,
  deleteChunksForSession,
  deleteSession,
  deleteSessionBlob,
  getQueueStats,
  getSessionBlob,
  listChunks,
  listSessions,
  saveChunk,
  saveSession,
  saveSessionBlob,
} from '../lib/chunkDb'
import type { StoredChunk, RecordingSession } from '../types'

function chunk(id: string, sessionId: string, sequence = 0, size = 10): StoredChunk {
  return {
    id,
    sessionId,
    sequence,
    createdAt: 1_000 + sequence,
    size,
    type: 'audio/webm',
    blob: new Blob([new Uint8Array(size)], { type: 'audio/webm' }),
  }
}

function session(id: string): RecordingSession {
  return {
    id,
    title: id,
    status: 'draft',
    createdAt: 0,
    updatedAt: 0,
    durationMs: 0,
    size: 0,
    mimeType: 'audio/webm',
    chunkCount: 0,
  }
}

describe('chunkDb', () => {
  beforeEach(async () => {
    await clearChunks()
    for (const existing of await listSessions()) {
      await deleteSession(existing.id)
    }
  })

  it('deletes only the chunks that belong to the session', async () => {
    await saveChunk(chunk('a', 's1', 0))
    await saveChunk(chunk('b', 's1', 1))
    await saveChunk(chunk('c', 's2', 0))

    await deleteChunksForSession('s1')

    const remaining = await listChunks()
    expect(remaining.map((item) => item.id)).toEqual(['c'])
  })

  it('is a no-op when the session has no chunks', async () => {
    await saveChunk(chunk('a', 's1', 0))
    await deleteChunksForSession('missing')

    expect((await listChunks()).map((item) => item.id)).toEqual(['a'])
  })

  it('reports queue aggregates across all chunks', async () => {
    await saveChunk(chunk('a', 's1', 0, 100))
    await saveChunk(chunk('b', 's1', 1, 250))
    await saveChunk(chunk('c', 's2', 0, 50))

    expect(await getQueueStats()).toEqual({ chunks: 3, bytes: 400, sessions: 2 })
  })

  it('lists sessions newest-first by updatedAt', async () => {
    await saveSession({ ...session('old'), updatedAt: 1 })
    await saveSession({ ...session('new'), updatedAt: 99 })

    expect((await listSessions()).map((item) => item.id)).toEqual(['new', 'old'])
  })

  it('stores session blobs separately from metadata', async () => {
    await saveSession(session('s1'))
    await saveSessionBlob('s1', new Blob(['hello'], { type: 'audio/webm' }))

    const metadata = (await listSessions()).find((item) => item.id === 's1')
    expect(metadata).toBeDefined()
    expect((metadata as Record<string, unknown>).blob).toBeUndefined()

    const blob = await getSessionBlob('s1')
    expect(blob).not.toBeNull()
    expect(await blob!.text()).toBe('hello')
  })

  it('clears the blob without touching metadata', async () => {
    await saveSession(session('s1'))
    await saveSessionBlob('s1', new Blob(['x']))

    await deleteSessionBlob('s1')

    expect(await getSessionBlob('s1')).toBeNull()
    expect((await listSessions()).map((item) => item.id)).toEqual(['s1'])
  })

  it('cascades deleteSession to the blob store', async () => {
    await saveSession(session('s1'))
    await saveSessionBlob('s1', new Blob(['x']))

    await deleteSession('s1')

    expect(await getSessionBlob('s1')).toBeNull()
    expect((await listSessions()).map((item) => item.id)).toEqual([])
  })

  it('rejects write operations that abort after the request succeeds', async () => {
    const originalPut = IDBObjectStore.prototype.put
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key)
      request.addEventListener('success', () => {
        this.transaction.abort()
      })
      return request
    })

    await expect(saveSession(session('aborted'))).rejects.toMatchObject({ name: 'AbortError' })
    putSpy.mockRestore()

    expect((await listSessions()).map((item) => item.id)).toEqual([])
  })
})
