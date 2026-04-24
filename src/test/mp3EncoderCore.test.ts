import { describe, expect, it } from 'vitest'
import { DEFAULT_MP3_EXPORT_SETTINGS } from '../services/mp3EncoderCore'

describe('mp3EncoderCore', () => {
  it('defaults to voice-oriented mono output settings', () => {
    expect(DEFAULT_MP3_EXPORT_SETTINGS).toEqual({
      bitRate: 32,
      channelCount: 1,
    })
  })
})
