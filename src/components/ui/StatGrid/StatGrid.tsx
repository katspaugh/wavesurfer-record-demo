import type { ReactNode } from 'react'
import styles from './StatGrid.module.css'

type StatGridProps = {
  ariaLabel: string
  children: ReactNode
  variant?: 'library' | 'meter'
}

type StatItemProps = {
  label: string
  value: ReactNode
}

export function StatGrid({ ariaLabel, children, variant = 'meter' }: StatGridProps) {
  return (
    <div className={variant === 'library' ? styles.librarySummary : styles.meterGrid} aria-label={ariaLabel}>
      {children}
    </div>
  )
}

export function StatItem({ label, value }: StatItemProps) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
