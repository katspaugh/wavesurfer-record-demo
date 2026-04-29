/** Keeps the active view in sync with the `?session=` URL param and exposes navigation handlers. */
import { useCallback, useEffect, useState } from 'react'
import { finalizeSession, type LoadedSession, loadSession } from '../lib/db'
import type { AppError } from '../lib/result'
import { buildSessionUrl, FRESH_TOKEN, readSessionParam } from '../lib/urlState'
import type { FinalizedTake } from './usePipeline'

export type AppView =
  | { kind: 'library' }
  | { kind: 'fresh' }
  | { kind: 'opened'; session: LoadedSession }

export type UseSessionRouterOptions = {
  onError: (error: AppError) => void
  refreshSessions: () => Promise<void>
}

export type UseSessionRouter = {
  view: AppView
  openLibrary: () => void
  openFresh: () => void
  openSession: (id: string) => Promise<void>
  handleTakeFinalized: (take: FinalizedTake) => Promise<void>
}

function currentSessionParam(): string | null {
  if (typeof window === 'undefined') return null
  return readSessionParam(window.location.search)
}

function writeSessionParam(value: string | null, mode: 'push' | 'replace') {
  if (typeof window === 'undefined') return
  const next = buildSessionUrl(
    window.location.pathname,
    window.location.search,
    window.location.hash,
    value,
  )
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next === current) return
  if (mode === 'push') window.history.pushState(null, '', next)
  else window.history.replaceState(null, '', next)
}

export function useSessionRouter(options: UseSessionRouterOptions): UseSessionRouter {
  const { onError, refreshSessions } = options
  const [view, setView] = useState<AppView>({ kind: 'library' })

  const applySessionParam = useCallback(
    async (param: string | null) => {
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
      if (!result.ok) onError(result.error)
      writeSessionParam(null, 'replace')
      setView({ kind: 'library' })
    },
    [onError],
  )

  useEffect(() => {
    void (async () => {
      await applySessionParam(currentSessionParam())
    })()
  }, [applySessionParam])

  useEffect(() => {
    const handler = () => void applySessionParam(currentSessionParam())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [applySessionParam])

  const openFresh = useCallback(() => {
    writeSessionParam(FRESH_TOKEN, 'push')
    setView({ kind: 'fresh' })
  }, [])

  const openSession = useCallback(
    async (id: string) => {
      const result = await loadSession(id)
      if (!result.ok) {
        onError(result.error)
        return
      }
      if (!result.value) return
      writeSessionParam(id, 'push')
      setView({ kind: 'opened', session: result.value })
    },
    [onError],
  )

  const openLibrary = useCallback(() => {
    writeSessionParam(null, 'push')
    setView({ kind: 'library' })
    void refreshSessions()
  }, [refreshSessions])

  const handleTakeFinalized = useCallback(
    async (take: FinalizedTake) => {
      const finalized = await finalizeSession(take.sessionId, {
        durationMs: take.durationMs,
        size: take.blob.size,
        mimeType: take.mimeType,
        transcript: take.transcript,
      })
      if (!finalized.ok) {
        onError(finalized.error)
        return
      }
      // Swap the URL to the new session id so a refresh restores the take instead of restarting fresh.
      writeSessionParam(take.sessionId, 'replace')
      void refreshSessions()
    },
    [onError, refreshSessions],
  )

  return { view, openLibrary, openFresh, openSession, handleTakeFinalized }
}
