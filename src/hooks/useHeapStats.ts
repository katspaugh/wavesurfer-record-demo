/** Polls performance.memory at a fixed interval and keeps a rolling sample window for the sparkline. */
import { useEffect, useState } from 'react'

type ChromePerformanceMemory = {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

export type HeapSample = {
  t: number
  used: number
  total: number
  limit: number
}

export type HeapStats = {
  supported: boolean
  latest: HeapSample | null
  history: HeapSample[]
}

const SAMPLE_INTERVAL_MS = 1_000
const HISTORY_LENGTH = 60

function readMemory(): ChromePerformanceMemory | null {
  const candidate = (performance as Performance & { memory?: ChromePerformanceMemory }).memory
  if (
    !candidate ||
    typeof candidate.usedJSHeapSize !== 'number' ||
    typeof candidate.totalJSHeapSize !== 'number' ||
    typeof candidate.jsHeapSizeLimit !== 'number'
  ) {
    return null
  }
  return candidate
}

export function useHeapStats(intervalMs: number = SAMPLE_INTERVAL_MS): HeapStats {
  const [history, setHistory] = useState<HeapSample[]>([])
  const supported = typeof performance !== 'undefined' && readMemory() !== null

  useEffect(() => {
    if (!supported) return
    const sample = () => {
      const m = readMemory()
      if (!m) return
      setHistory((prev) => {
        const next = [
          ...prev,
          { t: performance.now(), used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit },
        ]
        return next.length > HISTORY_LENGTH ? next.slice(-HISTORY_LENGTH) : next
      })
    }
    sample()
    const id = window.setInterval(sample, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, supported])

  return { supported, latest: history.at(-1) ?? null, history }
}
