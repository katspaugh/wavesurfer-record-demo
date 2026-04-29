import { Handle, Position } from '@xyflow/react'
import type { PipelineState } from '../../hooks/usePipeline'
import styles from './nodeStyles.module.css'

export type TranscriptionNodeData = {
  state: PipelineState
}

export function TranscriptionNode({ data }: { data: TranscriptionNodeData }) {
  const { state } = data
  const dotClass = state.transcriptionError
    ? styles.statusErr
    : state.transcriptionActive
      ? styles.statusOk
      : styles.statusIdle

  return (
    <div className={styles.node}>
      <header className={styles.header}>
        <h2>Step 5</h2>
        <h3>Live speech-to-text</h3>
      </header>
      <div className={styles.body}>
      <div className={styles.statusRow}>
        <span className={`${styles.statusDot} ${dotClass}`} />
        <span>
          {state.transcriptionActive
            ? 'Listening'
            : state.transcriptSegments.length > 0
              ? 'Idle · captured'
              : 'Idle'}
        </span>
      </div>
      <p>
        Runs in parallel with the recorder. Browser{' '}
        <code>SpeechRecognition</code> emits interim and final phrases that are
        streamed below.
      </p>

      <div className={`${styles.transcriptList} nodrag nowheel`}>
        {state.transcriptSegments.length === 0 && !state.partialTranscript ? (
          <p className={styles.empty}>No transcript yet. Start recording to listen.</p>
        ) : (
          <>
            {state.transcriptSegments.map((segment) => (
              <span key={segment.id}>{segment.text} </span>
            ))}
            {state.partialTranscript ? (
              <span className={styles.partial}>{state.partialTranscript}</span>
            ) : null}
          </>
        )}
      </div>

      {state.transcriptionError ? (
        <div className={styles.errorBox} role="alert">
          <strong>{state.transcriptionError.code}: </strong>
          {state.transcriptionError.message}
        </div>
      ) : null}

      <Handle type="target" position={Position.Top} />
      </div>
    </div>
  )
}
