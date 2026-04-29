/** Session list state: load, refresh, delete. Owns the shared loadError. */
import { useCallback, useEffect, useState } from 'react'
import { deleteSession as deleteSessionRecord, listSessions, type SessionMeta } from '../lib/db'
import type { AppError } from '../lib/result'

export type UseSessionList = {
  sessions: SessionMeta[]
  loadError: AppError | null
  setLoadError: (error: AppError | null) => void
  refreshSessions: () => Promise<void>
  deleteSession: (id: string) => Promise<void>
}

export function useSessionList(): UseSessionList {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loadError, setLoadError] = useState<AppError | null>(null)

  const refreshSessions = useCallback(async () => {
    const result = await listSessions()
    if (result.ok) {
      setSessions(result.value)
      setLoadError(null)
    } else {
      setLoadError(result.error)
    }
  }, [])

  const deleteSession = useCallback(
    async (id: string) => {
      const result = await deleteSessionRecord(id)
      if (!result.ok) {
        setLoadError(result.error)
        return
      }
      void refreshSessions()
    },
    [refreshSessions],
  )

  useEffect(() => {
    void (async () => {
      await refreshSessions()
    })()
  }, [refreshSessions])

  return { sessions, loadError, setLoadError, refreshSessions, deleteSession }
}
