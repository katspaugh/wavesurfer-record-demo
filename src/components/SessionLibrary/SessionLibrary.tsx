import { formatBytes, formatDuration } from '../../lib/audio'
import type { SessionMeta } from '../../lib/db'
import type { AppError } from '../../lib/result'
import styles from './SessionLibrary.module.css'

export type SessionLibraryProps = {
  sessions: SessionMeta[]
  loadError: AppError | null
  recoveryNotice: string | null
  onDismissRecoveryNotice: () => void
  onNewRecording: () => void
  onOpenSession: (id: string) => void
  onDeleteSession: (id: string) => void
}

export function SessionLibrary({
  sessions,
  loadError,
  recoveryNotice,
  onDismissRecoveryNotice,
  onNewRecording,
  onOpenSession,
  onDeleteSession,
}: SessionLibraryProps) {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.title}>
          <p>Recorder pipeline</p>
          <h1>Sessions</h1>
        </div>
        <button type="button" className={styles.newButton} onClick={onNewRecording}>
          New recording
        </button>
      </header>

      {recoveryNotice ? (
        <div className={styles.recoveryBanner} role="status">
          <span>{recoveryNotice}</span>
          <button
            type="button"
            className={styles.recoveryDismiss}
            onClick={onDismissRecoveryNotice}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loadError ? (
        <p className={styles.errorBanner} role="alert">
          {loadError.message}
        </p>
      ) : null}

      {sessions.length === 0 ? (
        <div className={styles.empty}>
          No saved recordings yet. Press <strong>New recording</strong> to capture one.
        </div>
      ) : (
        <div className={styles.list}>
          {sessions.map((session) => (
            <div className={styles.row} key={session.id}>
              <button
                type="button"
                className={styles.rowMain}
                onClick={() => onOpenSession(session.id)}
              >
                <span className={styles.rowTitle}>
                  {session.title}
                  {!session.finalized ? <span className={styles.draftBadge}>draft</span> : null}
                </span>
                <span className={styles.rowMeta}>
                  <span>{formatDuration(session.durationMs)}</span>
                  <span>{formatBytes(session.size)}</span>
                  <span>{session.mimeType}</span>
                  <span>
                    {new Date(session.createdAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => onOpenSession(session.id)}
              >
                Open
              </button>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                onClick={() => onDeleteSession(session.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
