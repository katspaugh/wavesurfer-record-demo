import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHUNKS_STORE,
  SESSIONS_STORE,
  clearChunksForSession,
  createSession,
  deleteSession,
  finalizeSession,
  getQueueSnapshotForSession,
  getSession,
  listChunkSessionIds,
  listChunksForSession,
  listSessions,
  loadSession,
  reconcileSessions,
  saveChunk,
  type SessionMeta,
  type StoredChunk,
} from '../lib/db'

function makeSession(id: string, finalized = false): SessionMeta {
  return {
    id,
    title: `Session ${id}`,
    createdAt: 1_000,
    updatedAt: 1_000,
    durationMs: 0,
    size: 0,
    mimeType: 'audio/webm',
    transcript: [],
    finalized,
  }
}

function makeChunk(sessionId: string, sequence: number, size: number): StoredChunk {
  return {
    id: `chunk-${sessionId}-${sequence}`,
    sessionId,
    sequence,
    createdAt: 2_000 + sequence,
    size,
    type: 'audio/webm',
    blob: new Blob([new Uint8Array(size)], { type: 'audio/webm' }),
  }
}

afterEach(async () => {
  // Wipe both stores between tests so state doesn't leak.
  const sessions = await listSessions()
  if (sessions.ok) {
    for (const session of sessions.value) await deleteSession(session.id)
  }
  const ids = await listChunkSessionIds()
  if (ids.ok) {
    for (const id of ids.value) await clearChunksForSession(id)
  }
})

describe('db schema', () => {
  it('exposes the expected store names', () => {
    expect(SESSIONS_STORE).toBe('sessions')
    expect(CHUNKS_STORE).toBe('chunks')
  })
})

describe('sessions + chunks', () => {
  it('creates, finalizes, lists, and loads a session backed by chunks', async () => {
    const created = await createSession(makeSession('s1'))
    expect(created.ok).toBe(true)

    await saveChunk(makeChunk('s1', 0, 100))
    await saveChunk(makeChunk('s1', 1, 250))

    const finalized = await finalizeSession('s1', {
      durationMs: 10_000,
      size: 350,
      mimeType: 'audio/webm',
      transcript: [],
    })
    expect(finalized.ok).toBe(true)
    if (finalized.ok) {
      expect(finalized.value.finalized).toBe(true)
      expect(finalized.value.durationMs).toBe(10_000)
    }

    const list = await listSessions()
    expect(list.ok).toBe(true)
    if (list.ok) expect(list.value.map((s) => s.id)).toEqual(['s1'])

    const loaded = await loadSession('s1')
    expect(loaded.ok).toBe(true)
    if (loaded.ok && loaded.value) {
      expect(loaded.value.blob.size).toBe(350)
      expect(loaded.value.finalized).toBe(true)
    }
  })

  it('partitions chunks by sessionId', async () => {
    await createSession(makeSession('s1'))
    await createSession(makeSession('s2'))
    await saveChunk(makeChunk('s1', 0, 100))
    await saveChunk(makeChunk('s1', 1, 200))
    await saveChunk(makeChunk('s2', 0, 999))

    const s1 = await listChunksForSession('s1')
    if (s1.ok) expect(s1.value.map((c) => c.sequence)).toEqual([0, 1])

    const snapshot = await getQueueSnapshotForSession('s1')
    if (snapshot.ok) {
      expect(snapshot.value.bytes).toBe(300)
      expect(snapshot.value.chunks).toHaveLength(2)
      expect(Object.prototype.hasOwnProperty.call(snapshot.value.chunks[0]!, 'blob')).toBe(false)
    }
  })

  it('deletes session metadata and its chunks atomically', async () => {
    await createSession(makeSession('s1'))
    await saveChunk(makeChunk('s1', 0, 100))

    const deleted = await deleteSession('s1')
    expect(deleted.ok).toBe(true)

    const remaining = await getSession('s1')
    if (remaining.ok) expect(remaining.value).toBeNull()
    const stillChunks = await listChunksForSession('s1')
    if (stillChunks.ok) expect(stillChunks.value).toEqual([])
  })
})

describe('reconcileSessions', () => {
  it('promotes orphan chunks into a draft session and prunes empty drafts', async () => {
    // Orphan: chunks exist, no session row.
    await saveChunk(makeChunk('orphan', 0, 50))
    await saveChunk(makeChunk('orphan', 1, 70))
    // Empty draft: session exists, no chunks, not finalized.
    await createSession(makeSession('emptyDraft', false))
    // Healthy finalized session that should be untouched.
    await createSession(makeSession('keep', true))

    const result = await reconcileSessions({ chunkDurationMs: 5_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.recovered).toEqual(['orphan'])
    expect(result.value.pruned).toEqual(['emptyDraft'])
    expect(result.value.refreshed).toEqual([])

    const sessions = await listSessions()
    if (sessions.ok) {
      const ids = sessions.value.map((s) => s.id).sort()
      expect(ids).toEqual(['keep', 'orphan'])
      const orphanRow = sessions.value.find((s) => s.id === 'orphan')!
      expect(orphanRow.finalized).toBe(false)
      expect(orphanRow.size).toBe(120)
      // Two chunks × 5 s timeslice = 10 s estimated duration.
      expect(orphanRow.durationMs).toBe(10_000)
    }
  })

  it('refreshes draft size/duration for sessions whose chunks were written before the row caught up', async () => {
    // Draft session row created at start with zeroed metadata.
    await createSession(makeSession('draft', false))
    // Chunks written subsequently.
    await saveChunk(makeChunk('draft', 0, 80))
    await saveChunk(makeChunk('draft', 1, 90))
    await saveChunk(makeChunk('draft', 2, 100))

    const result = await reconcileSessions({ chunkDurationMs: 1_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.recovered).toEqual([])
    expect(result.value.pruned).toEqual([])
    expect(result.value.refreshed).toEqual(['draft'])

    const draft = await getSession('draft')
    if (draft.ok && draft.value) {
      expect(draft.value.size).toBe(270)
      expect(draft.value.durationMs).toBe(3_000)
      expect(draft.value.finalized).toBe(false)
    }
  })

  it('leaves finalized sessions alone even when their chunks remain in the queue', async () => {
    await createSession(makeSession('finalized', true))
    await saveChunk(makeChunk('finalized', 0, 100))

    const result = await reconcileSessions()
    if (result.ok) {
      expect(result.value.recovered).toEqual([])
      expect(result.value.refreshed).toEqual([])
      expect(result.value.pruned).toEqual([])
    }
  })
})
