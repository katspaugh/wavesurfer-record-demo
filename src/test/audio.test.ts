import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob, formatBytes, formatDuration, getSupportedRecordingMimeType } from '../lib/audio'

describe('audio formatting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('formats durations as HH:MM:SS', () => {
    expect(formatDuration(-1)).toBe('00:00:00')
    expect(formatDuration(3_723_000)).toBe('01:02:03')
  })

  it('formats byte counts with compact units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB')
  })

  it('selects the first supported recorder mime type', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type: string) => type === 'audio/webm',
    })

    expect(getSupportedRecordingMimeType()).toBe('audio/webm')
  })

  it('downloads blobs through an attached temporary anchor', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const anchor = {
      click,
      download: '',
      href: '',
      rel: '',
      remove,
      style: { display: '' },
      target: '',
    }
    const appendChild = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()

    vi.stubGlobal('document', {
      body: { appendChild },
      createElement: vi.fn(() => anchor),
    })
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void) => {
        callback()
        return 1
      },
    })

    const blob = new Blob(['audio'])
    downloadBlob(blob, 'recording.mp3')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(anchor.href).toBe('blob:test')
    expect(anchor.download).toBe('recording.mp3')
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
