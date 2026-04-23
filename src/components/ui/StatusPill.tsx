import type { RecordingStatus } from '../../types'
import styles from '../App.module.css'

type StatusPillProps = {
  label: string
  status: RecordingStatus
}

export function StatusPill({ label, status }: StatusPillProps) {
  return (
    <div className={styles.statusPill} data-status={status}>
      <span />
      {label}
    </div>
  )
}
