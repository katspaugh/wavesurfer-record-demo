import { Handle, Position } from '@xyflow/react'
import { formatDuration } from '../../lib/audio'
import type { PipelineState } from '../../hooks/usePipeline'
import styles from './nodeStyles.module.css'

const TIMELINE_WINDOW_MS = 5 * 60 * 1000

export type RecorderNodeData = {
  state: PipelineState
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

export function RecorderNode({ data }: { data: RecorderNodeData }) {
  const { state, onStart, onPause, onResume, onStop } = data
  const isRecording = state.status === 'recording'
  const isPaused = state.status === 'paused'
  const isStopping = state.status === 'stopping'
  const isStopped = state.status === 'stopped'
  const isStartable = state.status === 'idle' || isStopped
  const fillRatio = Math.min(1, state.elapsedMs / TIMELINE_WINDOW_MS)

  const dotClass = state.recorderError
    ? styles.statusErr
    : isRecording
      ? styles.statusOk
      : isPaused || isStopping
        ? styles.statusWarn
        : styles.statusIdle

  return (
    <div className={styles.node}>
      <header className={styles.header}>
        <h2>Step 2</h2>
        <h3>MediaRecorder timeline</h3>
      </header>
      <div className={styles.body}>
      <div className={styles.statusRow}>
        <span className={`${styles.statusDot} ${dotClass}`} />
        <span>
          {isRecording
            ? 'Recording'
            : isPaused
              ? 'Paused'
              : isStopping
                ? 'Stopping…'
                : isStopped
                  ? 'Take ready'
                  : 'Idle'}
        </span>
      </div>
      <p>
        Pipes the mic stream into <code>MediaRecorder</code>. Each
        {' '}<code>ondataavailable</code> event emits a 5s chunk into the queue downstream.
      </p>

      <div className={styles.timeline} aria-label="Elapsed recording time">
        <div className={styles.timelineFill} style={{ width: `${fillRatio * 100}%` }} />
        <div className={styles.timelineLabel}>
          {isRecording ? <span className={styles.recordDot} /> : null}
          {formatDuration(state.elapsedMs)}
        </div>
      </div>

      <div className={styles.metric}>
        <span>Format</span>
        <strong>{state.mimeType}</strong>
      </div>

      <div className={styles.buttonRow}>
        {isStartable ? (
          <button
            type="button"
            className={`${styles.button} nodrag`}
            onClick={onStart}
            disabled={state.status === 'requesting-mic'}
          >
            {isStopped ? 'Re-record' : 'Record'}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSecondary} nodrag`}
              onClick={isPaused ? onResume : onPause}
              disabled={!isRecording && !isPaused}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonDanger} nodrag`}
              onClick={onStop}
              disabled={!isRecording && !isPaused}
            >
              {isStopping ? 'Stopping…' : 'Stop'}
            </button>
          </>
        )}
      </div>

      {state.recorderError ? (
        <div className={styles.errorBox} role="alert">
          <strong>{state.recorderError.code}: </strong>
          {state.recorderError.message}
        </div>
      ) : null}

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} id="chunks" />
      <Handle type="source" position={Position.Bottom} id="audio" />
      </div>
    </div>
  )
}
