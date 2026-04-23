import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearChunks,
  deleteSession,
  getQueueStats,
  getSessionBlob,
  listChunkMetadataForSession,
  listSessions,
  saveChunk,
  saveSession,
  saveSessionBlob,
} from '../lib/chunkDb'
import { buildSessionBlobFromChunks, persistFinalizedSession, prepareSessionForFreshRecording } from '../services/sessionRecordingService'
import type { RecordingSession, StoredChunk, TranscriptResult } from '../types'

function chunk(id: string, sessionId: string, sequence = 0, size = 10): StoredChunk {
  return {
    blob: new Blob([new Uint8Array(size)], { type: 'audio/webm' }),
    createdAt: 1_000 + sequence,
    id,
    sequence,
    sessionId,
    size,
    type: 'audio/webm',
  }
}

function transcript(): TranscriptResult {
  return {
    confidence: 0.9,
    createdAt: 123,
    id: 'transcript-1',
    segments: [{
      confidence: 0.9,
      endMs: 1_400,
      id: 'segment-1',
      startMs: 200,
      text: 'hello world',
    }],
    text: 'hello world',
  }
}

function session(id: string): RecordingSession {
  return {
    chunkCount: 2,
    createdAt: 0,
    durationMs: 12_000,
    id,
    mimeType: 'audio/webm',
    size: 4_096,
    status: 'paused',
    title: id,
    transcript: transcript(),
    updatedAt: 0,
  }
}

describe('sessionRecordingService', () => {
  beforeEach(async () => {
    await clearChunks()
    for (const existing of await listSessions()) {
      await deleteSession(existing.id)
    }
  })

  it('clears stale session artifacts before a fresh recording starts', async () => {
    await saveSession(session('s1'))
    await saveChunk(chunk('a', 's1', 0, 100))
    await saveChunk(chunk('b', 's1', 1, 125))
    await saveSessionBlob('s1', new Blob(['old'], { type: 'audio/webm' }))

    const result = await prepareSessionForFreshRecording(session('s1'), 999)

    expect(result.session).toMatchObject({
      chunkCount: 0,
      durationMs: 0,
      id: 's1',
      size: 0,
      status: 'draft',
      updatedAt: 999,
    })
    expect(result.session.transcript).toBeUndefined()
    expect(result.cacheState.chunks).toEqual([])
    expect(result.cacheState.queueStats).toEqual({ bytes: 0, chunks: 0, sessions: 0 })
    expect(await listChunkMetadataForSession('s1')).toEqual([])
    expect(await getSessionBlob('s1')).toBeNull()
  })

  it('keeps the finalized blob and releases cached chunks', async () => {
    await saveSession(session('s1'))
    await saveChunk(chunk('a', 's1', 0, 100))
    await saveChunk(chunk('b', 's1', 1, 125))

    const blob = new Blob(['final'], { type: 'audio/webm;codecs=opus' })
    const result = await persistFinalizedSession({
      blob,
      durationMs: 24_000,
      mimeType: blob.type,
      now: 555,
      session: session('s1'),
    })

    expect(result.session).toMatchObject({
      chunkCount: 0,
      durationMs: 24_000,
      id: 's1',
      mimeType: 'audio/webm;codecs=opus',
      size: blob.size,
      status: 'stopped',
      updatedAt: 555,
    })
    expect(result.session.transcript?.text).toBe('hello world')
    expect(result.cacheState.chunks).toEqual([])
    expect(result.cacheState.queueStats).toEqual({ bytes: blob.size, chunks: 0, sessions: 1 })
    expect(await listChunkMetadataForSession('s1')).toEqual([])
    expect(await getQueueStats()).toEqual({ bytes: blob.size, chunks: 0, sessions: 1 })
    expect(await (await getSessionBlob('s1'))?.text()).toBe('final')
  })

  it('assembles a preview blob from stored chunks in sequence order', async () => {
    await saveChunk(chunk('b', 's1', 1, 2))
    await saveChunk(chunk('a', 's1', 0, 3))

    const blob = await buildSessionBlobFromChunks('s1')

    expect(blob).not.toBeNull()
    expect(blob?.type).toBe('audio/webm')
    expect(blob?.size).toBe(5)
  })
})
