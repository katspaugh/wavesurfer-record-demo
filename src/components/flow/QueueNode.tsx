import { Handle, Position } from '@xyflow/react'
import { formatBytes } from '../../lib/audio'
import type { PipelineState } from '../../hooks/usePipeline'
import styles from './nodeStyles.module.css'

export type QueueNodeData = {
  state: PipelineState
}

export function QueueNode({ data }: { data: QueueNodeData }) {
  const { state } = data

  return (
    <div className={styles.node}>
      <header className={styles.header}>
        <h2>Step 3</h2>
        <h3>IndexedDB chunk queue</h3>
      </header>
      <div className={styles.body}>
        <div className={styles.statusRow}>
          <span className={`${styles.statusDot} ${state.queueChunks.length > 0 ? styles.statusOk : styles.statusIdle}`} />
          <span>{state.queueChunks.length} chunks · {formatBytes(state.queueBytes)}</span>
        </div>
        <p>
          Each chunk is appended to the <code>chunks</code> object store via{' '}
          <code>idb.put()</code>. The queue drains automatically when MP3 export starts.
        </p>

        <div className={`${styles.queueLog} nodrag nowheel`}>
          <div className={`${styles.queueRow} ${styles.queueHead}`}>
            <span></span>
            <span>Seq</span>
            <span>Size</span>
          </div>
          {state.recentQueueEvents.length === 0 ? (
            <p className={styles.empty}>No traffic yet.</p>
          ) : (
            state.recentQueueEvents.map((event) => (
              <div className={styles.queueRow} key={`${event.id}-${event.kind}-${event.at}`}>
                <span className={event.kind === 'enqueue' ? styles.queueArrowIn : styles.queueArrowOut}>
                  {event.kind === 'enqueue' ? '→ in' : '← out'}
                </span>
                <code>#{event.sequence + 1}</code>
                <span>{formatBytes(event.size)}</span>
              </div>
            ))
          )}
        </div>

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Bottom} />
      </div>
    </div>
  )
}
