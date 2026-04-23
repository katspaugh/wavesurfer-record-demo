import styles from './ProgressBar.module.css'

type ProgressBarProps = {
  value: number
}

export function ProgressBar({ value }: ProgressBarProps) {
  const percentage = Math.max(0, Math.min(100, Math.round(value * 100)))

  return (
    <div className={styles.progressTrack} aria-hidden="true">
      <span style={{ width: `${percentage}%` }} />
    </div>
  )
}
