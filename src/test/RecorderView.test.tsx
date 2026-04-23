// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecorderView } from '../components/RecorderView'
import { RecorderContext } from '../context/RecorderContext'
import { createRecorderContextValue } from './testUtils'

afterEach(() => {
  cleanup()
})

describe('RecorderView', () => {
  it('renders recorder state from context and wires primary actions', () => {
    const createSession = vi.fn().mockResolvedValue(undefined)
    const exportMp3 = vi.fn().mockResolvedValue(undefined)
    const togglePreview = vi.fn().mockResolvedValue(undefined)
    const clearOfflineQueue = vi.fn().mockResolvedValue(undefined)

    render(
      <RecorderContext.Provider value={createRecorderContextValue({
        clearOfflineQueue,
        createSession,
        exportMp3,
        togglePreview,
      })}
      >
        <RecorderView />
      </RecorderContext.Provider>,
    )

    expect(screen.getByRole('heading', { name: 'Session 01' })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Audio waveform.*Elapsed 00:00:12/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Play Preview/u }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: /New Session/u }))
    fireEvent.click(screen.getByRole('button', { name: /Download MP3/u }))
    fireEvent.click(screen.getByRole('button', { name: /Play Preview/u }))
    fireEvent.click(screen.getByRole('button', { name: /Clear Session Cache/u }))

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(exportMp3).toHaveBeenCalledTimes(1)
    expect(togglePreview).toHaveBeenCalledTimes(1)
    expect(clearOfflineQueue).toHaveBeenCalledTimes(1)
  })

  it('disables recording controls for finalized sessions', () => {
    render(
      <RecorderContext.Provider value={createRecorderContextValue()}>
        <RecorderView />
      </RecorderContext.Provider>,
    )

    expect(screen.queryByRole('button', { name: /^Record/u })).toBeNull()
    expect(screen.getByRole('button', { name: /Pause/u }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /Resume/u }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /Finish/u }).hasAttribute('disabled')).toBe(true)
  })

  it('places the record action over an empty waveform before recording', () => {
    const startRecording = vi.fn().mockResolvedValue(undefined)

    render(
      <RecorderContext.Provider value={createRecorderContextValue({
        activeSession: {
          id: 'session-1',
          title: 'Session 01',
          status: 'draft',
          createdAt: 1,
          updatedAt: 1,
          durationMs: 0,
          size: 0,
          mimeType: 'audio/webm',
          chunkCount: 0,
        },
        elapsedMs: 0,
        isFinalized: false,
        recordedBlob: null,
        recordedUrl: null,
        startRecording,
        status: 'idle',
        statusLabel: 'ready',
      })}
      >
        <RecorderView />
      </RecorderContext.Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Record/u }))

    expect(startRecording).toHaveBeenCalledTimes(1)
  })

  it('keeps preview playback enabled for paused sessions with a recording', () => {
    render(
      <RecorderContext.Provider value={createRecorderContextValue({
        isFinalized: false,
        status: 'paused',
        statusLabel: 'paused',
      })}
      >
        <RecorderView />
      </RecorderContext.Provider>,
    )

    expect(screen.getByRole('button', { name: /Play Preview/u }).hasAttribute('disabled')).toBe(false)
  })
})
