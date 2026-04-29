import { useCallback } from 'react'
import { PipelineFlow } from './components/flow/PipelineFlow'
import { SessionLibrary } from './components/SessionLibrary'
import { useSessionList } from './hooks/useSessionList'
import { useSessionRecovery } from './hooks/useSessionRecovery'
import { useSessionRouter } from './hooks/useSessionRouter'

function App() {
  const { sessions, loadError, setLoadError, refreshSessions, deleteSession } = useSessionList()
  const { recoveryNotice, dismissRecoveryNotice } = useSessionRecovery(setLoadError)
  const { view, openLibrary, openFresh, openSession, handleTakeFinalized } = useSessionRouter({
    onError: setLoadError,
    refreshSessions,
  })

  const onTakeFinalized = useCallback(
    (take: Parameters<typeof handleTakeFinalized>[0]) => void handleTakeFinalized(take),
    [handleTakeFinalized],
  )

  if (view.kind === 'library') {
    return (
      <SessionLibrary
        sessions={sessions}
        loadError={loadError}
        recoveryNotice={recoveryNotice}
        onDismissRecoveryNotice={dismissRecoveryNotice}
        onNewRecording={openFresh}
        onOpenSession={(id) => void openSession(id)}
        onDeleteSession={(id) => void deleteSession(id)}
      />
    )
  }

  return (
    <PipelineFlow
      key={view.kind === 'opened' ? view.session.id : 'fresh'}
      initialSession={view.kind === 'opened' ? view.session : null}
      onTakeFinalized={onTakeFinalized}
      onBackToLibrary={openLibrary}
    />
  )
}

export default App
