import { describe, expect, it } from 'vitest'
import { createTranscriptRegionColor } from '../lib/transcriptRegionColor'

describe('transcriptRegionColor', () => {
  it('creates deterministic semi-transparent pastel colors from a seed', () => {
    expect(createTranscriptRegionColor('segment-1')).toBe('hsla(159, 72%, 82%, 0.34)')
    expect(createTranscriptRegionColor('segment-1')).toBe('hsla(159, 72%, 82%, 0.34)')
    expect(createTranscriptRegionColor('segment-2')).toBe('hsla(160, 72%, 82%, 0.34)')
  })
})
