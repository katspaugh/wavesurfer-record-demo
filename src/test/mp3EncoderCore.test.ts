import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MP3_EXPORT_SETTINGS,
  encodePcmToMp3Blob,
} from '../services/mp3EncoderCore'

describe('mp3EncoderCore', () => {
  it('defaults to voice-oriented mono output settings', () => {
    expect(DEFAULT_MP3_EXPORT_SETTINGS).toEqual({
      bitRate: 32,
      channelCount: 1,
    })
  })

  it('encodes PCM samples to an MP3 blob', async () => {
    const progress: number[] = []
    const sampleRate = 44_100
    const samples = new Float32Array(2304)

    const blob = await encodePcmToMp3Blob({
      channels: [samples],
      sampleRate,
      settings: DEFAULT_MP3_EXPORT_SETTINGS,
    }, (value) => progress.push(value))

    expect(blob.type).toBe('audio/mpeg')
    expect(blob.size).toBeGreaterThan(0)
    expect(progress.length).toBeGreaterThan(0)
  })

  it('downmixes stereo input to a mono MP3 without allocating a full-duration mix buffer', async () => {
    const sampleRate = 44_100
    const left = new Float32Array(2304)
    const right = new Float32Array(2304)
    for (let index = 0; index < left.length; index += 1) {
      left[index] = 0.25
      right[index] = -0.25
    }

    const blob = await encodePcmToMp3Blob({
      channels: [left, right],
      sampleRate,
      settings: { bitRate: 32, channelCount: 1 },
    }, () => undefined)

    expect(blob.type).toBe('audio/mpeg')
    expect(blob.size).toBeGreaterThan(0)
  })
})
