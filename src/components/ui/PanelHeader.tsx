import type { ReactNode } from 'react'
import styles from '../App.module.css'

type PanelHeaderProps = {
  eyebrow: string
  meta?: ReactNode
  title: string
}

export function PanelHeader({ eyebrow, meta, title }: PanelHeaderProps) {
  return (
    <div className={styles.panelHeading}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      {meta !== null && meta !== undefined ? <span>{meta}</span> : null}
    </div>
  )
}
