import type { HTMLAttributes, ReactNode } from 'react'
import styles from '../App.module.css'
import { cx } from '../styles'

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export function Panel({ children, className, ...props }: PanelProps) {
  return (
    <div className={cx(styles.toolPanel, className)} {...props}>
      {children}
    </div>
  )
}
