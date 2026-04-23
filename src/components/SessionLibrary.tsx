import { formatBytes, formatDuration } from '../lib/audio'
import type { QueueStats, RecordingSession } from '../types'
import styles from './App.module.css'
import { Icon } from './Icon'
import { Button, EmptyState, IconButton, StatGrid, StatItem } from './ui'

type SessionLibraryProps = {
  queueStats: QueueStats
  sessions: RecordingSession[]
  onCreateSession: () => void
  onOpenSession: (session: RecordingSession) => void
  onRemoveSession: (sessionId: string) => void
}

export function SessionLibrary({ queueStats, sessions, onCreateSession, onOpenSession, onRemoveSession }: SessionLibraryProps) {
  const totalDurationMs = sessions.reduce((total, session) => total + session.durationMs, 0)

  return (
    <main className={styles.appShell}>
      <section className={styles.sessionLibrary} aria-labelledby="library-title">
        <header className={styles.libraryHero}>
          <div>
            <p className={styles.eyebrow}>React Audio Recorder</p>
            <h1 className={styles.title} id="library-title">Recording Sessions</h1>
          </div>
          <Button className={styles.newSessionButton} variant="primary" onClick={onCreateSession}>
            <Icon name="record" />
            New Session
          </Button>
        </header>

        <StatGrid ariaLabel="Session summary" variant="library">
          <StatItem label="Total sessions" value={sessions.length} />
          <StatItem label="Total duration" value={formatDuration(totalDurationMs)} />
          <StatItem label="Offline cache" value={formatBytes(queueStats.bytes)} />
        </StatGrid>

        <div className={styles.sessionList} aria-label="Recording sessions">
          {sessions.length === 0 ? (
            <EmptyState
              variant="library"
              action={(
                <Button onClick={onCreateSession}>
                  <Icon name="record" />
                  Start Recording
                </Button>
              )}
            >
              No sessions yet.
            </EmptyState>
          ) : (
            sessions.map((session) => (
              <article className={styles.sessionCard} key={session.id}>
                <Button className={styles.sessionOpen} onClick={() => onOpenSession(session)}>
                  <span className={styles.sessionStatus} data-status={session.status} />
                  <span>
                    <strong>{session.title}</strong>
                    <small>{new Date(session.updatedAt).toLocaleString()}</small>
                  </span>
                  <span>{formatDuration(session.durationMs)}</span>
                  <span>{formatBytes(session.size)}</span>
                </Button>
                <IconButton aria-label={`Delete ${session.title}`} onClick={() => onRemoveSession(session.id)}>
                  <Icon name="clear" />
                </IconButton>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  )
}
