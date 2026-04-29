import { useCallback, useEffect, useState } from 'react'
import { PipelineFlow } from './components/flow/PipelineFlow'
import { SessionLibrary } from './components/SessionLibrary'
import type { FinalizedTake } from './hooks/usePipeline'
import {
  deleteSession,
  finalizeSession,
  listSessions,
  loadSession,
  reconcileSessions,
  type LoadedSession,
  type SessionMeta,
} from './lib/db'
import type { AppError } from './lib/result'
import { CHUNK_TIMESLICE_MS } from './services/mediaRecorderService'

type AppView =
  | { kind: 'library' }
  | { kind: 'fresh' }
  | { kind: 'opened'; session: LoadedSession }

const SESSION_PARAM = 'session'
const FRESH_TOKEN = 'new'

function readSessionParam(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(SESSION_PARAM)
}

function writeSessionParam(value: string | null, mode: 'push' | 'replace') {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (value) params.set(SESSION_PARAM, value)
  else params.delete(SESSION_PARAM)
  const search = params.toString()
  const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
  if (mode === 'push') window.history.pushState(null, '', next)
  else window.history.replaceState(null, '', next)
}

function App() {
  const [view, setView] = useState<AppView>({ kind: 'library' })
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loadError, setLoadError] = useState<AppError | null>(null)
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)

  const refreshSessions = useCallback(async () => {
    const result = await listSessions()
    if (result.ok) {
      setSessions(result.value)
      setLoadError(null)
    } else {
      setLoadError(result.error)
    }
  }, [])

  const applySessionParam = useCallback(async (param: string | null) => {
    if (!param) {
      setView({ kind: 'library' })
      return
    }
    if (param === FRESH_TOKEN) {
      setView({ kind: 'fresh' })
      return
    }
    const result = await loadSession(param)
    if (result.ok && result.value) {
      setView({ kind: 'opened', session: result.value })
      return
    }
    // URL points at a session that no longer exists — fall back to library and clean the URL.
    if (!result.ok) setLoadError(result.error)
    writeSessionParam(null, 'replace')
    setView({ kind: 'library' })
  }, [])

  useEffect(() => {
    void (async () => {
      const reconciled = await reconcileSessions({ chunkDurationMs: CHUNK_TIMESLICE_MS })
      if (reconciled.ok) {
        const { recovered, refreshed } = reconciled.value
        const interrupted = recovered.length + refreshed.length
        if (interrupted > 0) {
          setRecoveryNotice(
            `Recovered ${interrupted} interrupted recording${interrupted === 1 ? '' : 's'}. Open a draft to listen back or finish encoding.`,
          )
        }
      } else {
        setLoadError(reconciled.error)
      }
      await refreshSessions()
      await applySessionParam(readSessionParam())
    })()
  }, [applySessionParam, refreshSessions])

  useEffect(() => {
    const handler = () => void applySessionParam(readSessionParam())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [applySessionParam])

  const handleNewRecording = useCallback(() => {
    writeSessionParam(FRESH_TOKEN, 'push')
    setView({ kind: 'fresh' })
  }, [])

  const handleOpenSession = useCallback(async (id: string) => {
    const result = await loadSession(id)
    if (!result.ok) {
      setLoadError(result.error)
      return
    }
    if (!result.value) return
    writeSessionParam(id, 'push')
    setView({ kind: 'opened', session: result.value })
  }, [])

  const handleDeleteSession = useCallback(async (id: string) => {
    const result = await deleteSession(id)
    if (!result.ok) {
      setLoadError(result.error)
      return
    }
    void refreshSessions()
  }, [refreshSessions])

  const handleBackToLibrary = useCallback(() => {
    writeSessionParam(null, 'push')
    setView({ kind: 'library' })
    void refreshSessions()
  }, [refreshSessions])

  const handleTakeFinalized = useCallback(async (take: FinalizedTake) => {
    const finalized = await finalizeSession(take.sessionId, {
      durationMs: take.durationMs,
      size: take.blob.size,
      mimeType: take.mimeType,
      transcript: take.transcript,
    })
    if (!finalized.ok) {
      setLoadError(finalized.error)
      return
    }
    // Swap the URL to the new session id so a refresh restores the take instead of restarting fresh.
    writeSessionParam(take.sessionId, 'replace')
    void refreshSessions()
  }, [refreshSessions])

  if (view.kind === 'library') {
    return (
      <SessionLibrary
        sessions={sessions}
        loadError={loadError}
        recoveryNotice={recoveryNotice}
        onDismissRecoveryNotice={() => setRecoveryNotice(null)}
        onNewRecording={handleNewRecording}
        onOpenSession={(id) => void handleOpenSession(id)}
        onDeleteSession={(id) => void handleDeleteSession(id)}
      />
    )
  }

  return (
    <PipelineFlow
      key={view.kind === 'opened' ? view.session.id : 'fresh'}
      initialSession={view.kind === 'opened' ? view.session : null}
      onTakeFinalized={(take) => void handleTakeFinalized(take)}
      onBackToLibrary={handleBackToLibrary}
    />
  )
}

export default App
