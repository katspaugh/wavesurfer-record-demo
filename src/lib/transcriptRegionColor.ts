const TRANSCRIPT_REGION_SATURATION = 72
const TRANSCRIPT_REGION_LIGHTNESS = 82
const TRANSCRIPT_REGION_ALPHA = 0.34
const MAX_HUE = 359

export function createRandomTranscriptRegionColor(random: () => number = Math.random): string {
  const hue = Math.round(random() * MAX_HUE)
  return `hsla(${hue}, ${TRANSCRIPT_REGION_SATURATION}%, ${TRANSCRIPT_REGION_LIGHTNESS}%, ${TRANSCRIPT_REGION_ALPHA})`
}
