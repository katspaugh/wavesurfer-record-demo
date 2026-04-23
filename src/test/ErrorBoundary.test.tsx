// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '../components/ErrorBoundary'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function BrokenChild(): ReactNode {
  throw new Error('Render failed')
}

describe('ErrorBoundary', () => {
  it('renders a fallback and supports reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })

    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: 'Recorder unavailable' })).toBeTruthy()
    expect(screen.getByText('Render failed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
