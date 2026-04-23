// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionLibrary } from '../components/SessionLibrary'
import type { RecordingSession } from '../types'

afterEach(() => {
  cleanup()
})

function session(overrides: Partial<RecordingSession> = {}): RecordingSession {
  return {
    id: 'session-1',
    title: 'Session 01',
    status: 'stopped',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    durationMs: 65_000,
    size: 2_048,
    mimeType: 'audio/webm',
    chunkCount: 3,
    ...overrides,
  }
}

describe('SessionLibrary', () => {
  it('starts an empty library from either create action', () => {
    const onCreateSession = vi.fn()

    render(
      <SessionLibrary
        queueStats={{ chunks: 0, bytes: 0, sessions: 0 }}
        sessions={[]}
        onCreateSession={onCreateSession}
        onOpenSession={() => undefined}
        onRemoveSession={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /New Session/u }))
    fireEvent.click(screen.getByRole('button', { name: /Start Recording/u }))

    expect(screen.getByText('No sessions yet.')).toBeTruthy()
    expect(screen.getByText('Total duration')).toBeTruthy()
    expect(screen.getByText('00:00:00')).toBeTruthy()
    expect(onCreateSession).toHaveBeenCalledTimes(2)
  })

  it('opens and removes existing sessions', () => {
    const item = session()
    const second = session({
      durationMs: 55_000,
      id: 'session-2',
      size: 1_024,
      title: 'Session 02',
      updatedAt: 1_700_000_001_500,
    })
    const onOpenSession = vi.fn()
    const onRemoveSession = vi.fn()

    render(
      <SessionLibrary
        queueStats={{ chunks: 3, bytes: 3_072, sessions: 2 }}
        sessions={[item, second]}
        onCreateSession={() => undefined}
        onOpenSession={onOpenSession}
        onRemoveSession={onRemoveSession}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: /Session 01/u })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /Delete Session 01/u }))

    expect(screen.queryByText('Queued chunks')).toBeNull()
    expect(screen.getByText('Offline cache')).toBeTruthy()
    expect(screen.getByText('Total duration')).toBeTruthy()
    expect(screen.getByText('00:02:00')).toBeTruthy()
    expect(screen.queryByText(/chunks/u)).toBeNull()
    expect(onOpenSession).toHaveBeenCalledWith(item)
    expect(onRemoveSession).toHaveBeenCalledWith('session-1')
  })
})
