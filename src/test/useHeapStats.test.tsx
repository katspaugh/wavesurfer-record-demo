// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHeapStats } from '../hooks/useHeapStats'

type MemoryShape = { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }

const originalMemoryDescriptor = Object.getOwnPropertyDescriptor(
  globalThis.performance,
  'memory',
)

function installMemory(value: MemoryShape | undefined) {
  Object.defineProperty(globalThis.performance, 'memory', {
    configurable: true,
    get: () => value,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  installMemory({ usedJSHeapSize: 1_000, totalJSHeapSize: 2_000, jsHeapSizeLimit: 4_000 })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  if (originalMemoryDescriptor) {
    Object.defineProperty(globalThis.performance, 'memory', originalMemoryDescriptor)
  } else {
    delete (globalThis.performance as Performance & { memory?: unknown }).memory
  }
})

describe('useHeapStats', () => {
  it('reports unsupported when performance.memory is missing', () => {
    installMemory(undefined)
    const { result } = renderHook(() => useHeapStats())
    expect(result.current.supported).toBe(false)
    expect(result.current.latest).toBeNull()
    expect(result.current.history).toEqual([])
  })

  it('reports unsupported when any field is missing', () => {
    installMemory({ usedJSHeapSize: 1, totalJSHeapSize: 2 } as unknown as MemoryShape)
    const { result } = renderHook(() => useHeapStats())
    expect(result.current.supported).toBe(false)
  })

  it('caps the rolling history at 60 samples', () => {
    let used = 1_000
    Object.defineProperty(globalThis.performance, 'memory', {
      configurable: true,
      get: () => ({ usedJSHeapSize: used, totalJSHeapSize: 2_000, jsHeapSizeLimit: 4_000 }),
    })
    const { result } = renderHook(() => useHeapStats(10))
    expect(result.current.history).toHaveLength(1)
    act(() => {
      for (let i = 0; i < 100; i++) {
        used += 1
        vi.advanceTimersByTime(10)
      }
    })
    expect(result.current.history.length).toBeLessThanOrEqual(60)
    expect(result.current.latest?.used).toBeGreaterThan(1_000)
  })

  it('clears the polling interval on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const { unmount } = renderHook(() => useHeapStats(10))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})
