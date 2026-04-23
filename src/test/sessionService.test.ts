import { describe, expect, it, vi } from 'vitest'
import {
  applySessionPatch,
  createAsyncQueue,
  createDraftSession,
  findSessionFromQuery,
  getChunkBytes,
  getNextSessionTitle,
  reconcileSessionStatus,
  setSessionQuery,
} from '../services/sessionService'
import type { ChunkMetadata, RecordingSession } from '../types'

function session(id: string): RecordingSession {
  return {
    id,
    title: id,
    status: 'draft',
    createdAt: 100,
    updatedAt: 100,
    durationMs: 0,
    size: 0,
    mimeType: 'audio/webm',
    chunkCount: 0,
  }
}

function chunk(id: string, sessionId: string, size: number): ChunkMetadata {
  return {
    id,
    sessionId,
    sequence: 0,
    createdAt: 100,
    size,
    type: 'audio/webm',
  }
}

describe('sessionService', () => {
  it('creates numbered draft sessions', () => {
    expect(getNextSessionTitle(8)).toBe('Session 09')
    expect(createDraftSession({ id: 'abc', mimeType: '', now: 200, sessionCount: 0 })).toEqual({
      id: 'abc',
      title: 'Session 01',
      status: 'draft',
      createdAt: 200,
      updatedAt: 200,
      durationMs: 0,
      size: 0,
      mimeType: 'browser default',
      chunkCount: 0,
    })
  })

  it('applies patches with a fresh updatedAt timestamp', () => {
    expect(applySessionPatch(session('s1'), { chunkCount: 3, status: 'recording' }, 300)).toMatchObject({
      id: 's1',
      chunkCount: 3,
      status: 'recording',
      updatedAt: 300,
    })
  })

  it('totals bytes across chunk metadata', () => {
    expect(getChunkBytes([chunk('c1', 's1', 10), chunk('c3', 's1', 20)])).toBe(30)
    expect(getChunkBytes([])).toBe(0)
  })

  it('reconciles a crashed recording to paused when no blob was persisted', () => {
    const crashed = { ...session('s1'), status: 'recording' as const }
    expect(reconcileSessionStatus(crashed, 500, false)).toMatchObject({
      status: 'paused',
      updatedAt: 500,
    })
  })

  it('reconciles a crashed recording to stopped when a blob is persisted', () => {
    const crashed = { ...session('s1'), status: 'recording' as const }
    expect(reconcileSessionStatus(crashed, 500, true)).toMatchObject({
      status: 'stopped',
      updatedAt: 500,
    })
  })

  it('leaves non-recording sessions untouched during reconciliation', () => {
    const draft = session('s1')
    expect(reconcileSessionStatus(draft, 999, false)).toBe(draft)
  })

  it('serializes queued writes so each task observes the previous one', async () => {
    const enqueue = createAsyncQueue()
    const log: string[] = []

    const first = enqueue(async () => {
      log.push('first:start')
      await new Promise((resolve) => setTimeout(resolve, 20))
      log.push('first:end')
    })
    const second = enqueue(async () => {
      log.push('second:start')
      log.push('second:end')
    })

    await Promise.all([first, second])
    expect(log).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('keeps the queue going after a task rejects', async () => {
    const enqueue = createAsyncQueue()
    const failure = enqueue(async () => {
      throw new Error('boom')
    })
    const success = enqueue(async () => 'ok')

    await expect(failure).rejects.toThrow('boom')
    await expect(success).resolves.toBe('ok')
  })

  it('reads and writes session ids in the query string', () => {
    const history = { replaceState: vi.fn() } as unknown as History
    const location = { pathname: '/recorder', search: '?mode=test' } as Location

    setSessionQuery('s2', location, history)
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/recorder?mode=test&session=s2')

    setSessionQuery(null, { pathname: '/recorder', search: '?mode=test&session=s2' } as Location, history)
    expect(history.replaceState).toHaveBeenLastCalledWith(null, '', '/recorder?mode=test')

    expect(findSessionFromQuery([session('s1'), session('s2')], '?session=s2')?.id).toBe('s2')
    expect(findSessionFromQuery([session('s1')], '?session=missing')).toBeNull()
  })
})
