import { describe, expect, it } from 'vitest'
import { createStoredChunk } from '../services/recordingService'

describe('recordingService', () => {
  it('creates a stored chunk from a recorder blob', () => {
    const blob = new Blob(['audio'], { type: 'audio/ogg' })

    expect(createStoredChunk({
      blob,
      fallbackType: 'audio/webm',
      id: 'chunk-1',
      now: 123,
      sequence: 4,
      sessionId: 'session-1',
    })).toMatchObject({
      id: 'chunk-1',
      sessionId: 'session-1',
      sequence: 4,
      createdAt: 123,
      size: blob.size,
      type: 'audio/ogg',
      blob,
    })
  })

  it('falls back to the configured mime type', () => {
    const blob = new Blob(['audio'])

    expect(createStoredChunk({
      blob,
      fallbackType: 'audio/webm',
      id: 'chunk-1',
      now: 123,
      sequence: 0,
      sessionId: 'session-1',
    }).type).toBe('audio/webm')
  })
})
