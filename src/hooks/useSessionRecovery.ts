/** Runs reconcileSessions on mount and surfaces a recovery notice when drafts were salvaged. */
import { useEffect, useState } from 'react'
import { reconcileSessions } from '../lib/db'
import type { AppError } from '../lib/result'
import { CHUNK_TIMESLICE_MS } from '../services/mediaRecorderService'

export type UseSessionRecovery = {
  recoveryNotice: string | null
  dismissRecoveryNotice: () => void
}

export function useSessionRecovery(onError: (error: AppError) => void): UseSessionRecovery {
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const result = await reconcileSessions({ chunkDurationMs: CHUNK_TIMESLICE_MS })
      if (!result.ok) {
        onError(result.error)
        return
      }
      const { recovered, refreshed } = result.value
      const interrupted = recovered.length + refreshed.length
      if (interrupted > 0) {
        setRecoveryNotice(
          `Recovered ${interrupted} interrupted recording${interrupted === 1 ? '' : 's'}. Open a draft to listen back or finish encoding.`,
        )
      }
    })()
  }, [onError])

  return {
    recoveryNotice,
    dismissRecoveryNotice: () => setRecoveryNotice(null),
  }
}
