import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MP3_EXPORT_SETTINGS,
  encodePcmToMp3Blob,
  createExportChannels,
} from '../services/mp3EncoderCore'

describe('mp3EncoderCore', () => {
  it('defaults to voice-oriented mono output settings', () => {
    expect(DEFAULT_MP3_EXPORT_SETTINGS).toEqual({
      bitRate: 32,
      channelCount: 1,
    })
  })

  it('mixes source channels down to mono for voice export', () => {
    const [mono] = createExportChannels([
      new Float32Array([1, 0.5, 0]),
      new Float32Array([0, -0.5, -1]),
    ], 1)
    if (!mono) throw new Error('expected mono channel')

    expect(Array.from(mono)).toEqual([0.5, 0, -0.5])
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
})
