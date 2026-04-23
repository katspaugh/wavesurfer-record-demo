import { RecorderView } from './components/RecorderView'
import { SessionLibrary } from './components/SessionLibrary'
import { RecorderProvider } from './context/RecorderProvider'
import { useRecorder } from './context/useRecorder'

function App() {
  return (
    <RecorderProvider>
      <RecorderShell />
    </RecorderProvider>
  )
}

function RecorderShell() {
  const recorder = useRecorder()

  if (recorder.view === 'sessions') {
    return (
      <SessionLibrary
        queueStats={recorder.queueStats}
        sessions={recorder.sessions}
        onCreateSession={() => void recorder.createSession()}
        onOpenSession={recorder.openSession}
        onRemoveSession={(sessionId) => void recorder.removeSession(sessionId)}
      />
    )
  }

  return <RecorderView />
}

export default App
