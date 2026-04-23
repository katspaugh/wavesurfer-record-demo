import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

type EmptyStateVariant = 'library' | 'strip'

type EmptyStateProps = {
  action?: ReactNode
  children: ReactNode
  variant?: EmptyStateVariant
}

export function EmptyState({ action, children, variant = 'strip' }: EmptyStateProps) {
  if (variant === 'library') {
    return (
      <div className={styles.emptyLibrary}>
        <p>{children}</p>
        {action}
      </div>
    )
  }

  return <div className={styles.emptyStrip}>{children}</div>
}
