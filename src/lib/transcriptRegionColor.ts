const TRANSCRIPT_REGION_SATURATION = 72
const TRANSCRIPT_REGION_LIGHTNESS = 82
const TRANSCRIPT_REGION_ALPHA = 0.34
const HUE_COUNT = 360

function getTranscriptRegionHue(seed: string): number {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  return hash % HUE_COUNT
}

export function createTranscriptRegionColor(seed: string): string {
  const hue = getTranscriptRegionHue(seed)
  return `hsla(${hue}, ${TRANSCRIPT_REGION_SATURATION}%, ${TRANSCRIPT_REGION_LIGHTNESS}%, ${TRANSCRIPT_REGION_ALPHA})`
}
