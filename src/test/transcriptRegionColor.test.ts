import { describe, expect, it } from 'vitest'
import { createRandomTranscriptRegionColor } from '../lib/transcriptRegionColor'

describe('transcriptRegionColor', () => {
  it('creates semi-transparent pastel colors from a random hue', () => {
    expect(createRandomTranscriptRegionColor(() => 0)).toBe('hsla(0, 72%, 82%, 0.34)')
    expect(createRandomTranscriptRegionColor(() => 0.5)).toBe('hsla(180, 72%, 82%, 0.34)')
    expect(createRandomTranscriptRegionColor(() => 1)).toBe('hsla(359, 72%, 82%, 0.34)')
  })
})
