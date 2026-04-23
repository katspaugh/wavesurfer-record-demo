import { type Dispatch, useCallback, useEffect, useRef } from 'react'
import {
  deleteSession,
  getQueueStats,
  getSessionBlob,
  listChunkMetadataForSession,
  listSessions,
  saveSession,
} from '../lib/chunkDb'
import type { RecorderAction } from '../state/recorderReducer'
import { applySessionPatch, createAsyncQueue, reconcileSessionStatus } from '../services/sessionService'
import type { RecordingSession } from '../types'

type UseRecorderPersistenceOptions = {
  activeSession: RecordingSession | null
  dispatch: Dispatch<RecorderAction>
  elapsedMs: number
}

export function useRecorderPersistence({
  activeSession,
  dispatch,
  elapsedMs,
}: UseRecorderPersistenceOptions) {
  const sessionIdRef = useRef<string>(crypto.randomUUID())
  const activeSessionRef = useRef<RecordingSession | null>(null)
  const chunkSequenceRef = useRef(0)
  const elapsedMsRef = useRef(0)
  const enqueueSessionWrite = useRef(createAsyncQueue()).current

  useEffect(() => {
    activeSessionRef.current = activeSession
    if (activeSession) sessionIdRef.current = activeSession.id
  }, [activeSession])

  useEffect(() => {
    elapsedMsRef.current = elapsedMs
  }, [elapsedMs])

  const getElapsedMs = useCallback(() => elapsedMsRef.current, [])

  const refreshQueueStats = useCallback(async () => {
    const stats = await getQueueStats()
    dispatch({ type: 'set-queue-stats', stats })
    return stats
  }, [dispatch])

  const refreshSessionChunks = useCallback(async (sessionId: string | undefined | null) => {
    if (!sessionId) {
      dispatch({ type: 'set-session-chunks', chunks: [] })
      return []
    }

    const chunks = await listChunkMetadataForSession(sessionId)
    if (activeSessionRef.current?.id === sessionId) {
      dispatch({ type: 'set-session-chunks', chunks })
    }
    return chunks
  }, [dispatch])

  const refreshSessions = useCallback(async () => {
    const sessions = await listSessions()
    dispatch({ type: 'set-sessions', sessions })
    return sessions
  }, [dispatch])

  const reconcileAndLoadSessions = useCallback(async () => {
    const sessions = await listSessions()
    const now = Date.now()
    const reconciled = await Promise.all(sessions.map(async (session) => {
      if (session.status !== 'recording') return session
      const hasBlob = Boolean(await getSessionBlob(session.id))
      const patched = reconcileSessionStatus(session, now, hasBlob)
      if (patched !== session) await saveSession(patched)
      return patched
    }))
    dispatch({ type: 'set-sessions', sessions: reconciled })
    return reconciled
  }, [dispatch])

  useEffect(() => {
    void refreshQueueStats()
    void reconcileAndLoadSessions()
  }, [reconcileAndLoadSessions, refreshQueueStats])

  const commitSessionUpdate = useCallback((patch: Partial<RecordingSession>): Promise<void> => {
    const target = activeSessionRef.current
    if (!target) return Promise.resolve()
    const targetId = target.id

    return enqueueSessionWrite(async () => {
      const current = activeSessionRef.current
      if (!current || current.id !== targetId) return
      const nextSession = applySessionPatch(current, patch, Date.now())
      activeSessionRef.current = nextSession
      dispatch({ type: 'upsert-session', session: nextSession })
      await saveSession(nextSession)
    })
  }, [dispatch, enqueueSessionWrite])

  const removeSession = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId)
    dispatch({ type: 'delete-session', sessionId })
    await refreshQueueStats()
  }, [dispatch, refreshQueueStats])

  return {
    activeSessionRef,
    chunkSequenceRef,
    commitSessionUpdate,
    elapsedMsRef,
    getElapsedMs,
    refreshQueueStats,
    refreshSessionChunks,
    refreshSessions,
    reconcileAndLoadSessions,
    removeSession,
    sessionIdRef,
  }
}
