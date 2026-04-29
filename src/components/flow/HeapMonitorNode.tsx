import { useMemo } from 'react'
import { formatBytes } from '../../lib/audio'
import { useHeapStats, type HeapSample } from '../../hooks/useHeapStats'
import styles from './nodeStyles.module.css'

const SPARK_W = 280
const SPARK_H = 56
const SPARK_PAD = 4

function buildSparkPath(samples: HeapSample[], width: number, height: number, pad: number): string {
  if (samples.length < 2) return ''
  const min = samples.reduce((m, s) => Math.min(m, s.used), Infinity)
  const max = samples.reduce((m, s) => Math.max(m, s.used), -Infinity)
  const range = max - min || 1
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const stepX = innerW / (samples.length - 1)
  return samples
    .map((s, i) => {
      const x = pad + i * stepX
      const y = pad + innerH - ((s.used - min) / range) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

export function HeapMonitorNode() {
  const { supported, latest, history } = useHeapStats()
  const path = useMemo(() => buildSparkPath(history, SPARK_W, SPARK_H, SPARK_PAD), [history])

  return (
    <div className={styles.node}>
      <header className={styles.header}>
        <h2>Debug</h2>
        <h3>JS heap monitor</h3>
      </header>
      <div className={styles.body}>
        {!supported ? (
          <p>
            <code>performance.memory</code> is not available in this browser, so heap usage cannot be sampled here.
            (Chromium-only API.)
          </p>
        ) : (
          <>
            <div className={styles.statusRow}>
              <span className={`${styles.statusDot} ${latest ? styles.statusOk : styles.statusIdle}`} />
              <span>{latest ? formatBytes(latest.used) : '—'} used</span>
            </div>
            <p>
              Polls <code>performance.memory.usedJSHeapSize</code> every second. Only the JS heap — Blob bytes
              and worker heaps live elsewhere and won&apos;t show up here.
            </p>

            <svg
              className={styles.heapSpark}
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Used JS heap over the last minute"
            >
              <path d={path} fill="none" stroke="var(--green)" strokeWidth="1.5" />
            </svg>

            <div className={styles.metric}>
              <span>Used</span>
              <strong>{latest ? formatBytes(latest.used) : '—'}</strong>
            </div>
            <div className={styles.metric}>
              <span>Allocated</span>
              <strong>{latest ? formatBytes(latest.total) : '—'}</strong>
            </div>
            <div className={styles.metric}>
              <span>Limit</span>
              <strong>{latest ? formatBytes(latest.limit) : '—'}</strong>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
