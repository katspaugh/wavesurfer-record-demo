export type RecordingStatus =
  | 'idle'
  | 'requesting-mic'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'exporting'

export type TranscriptSegment = {
  id: string
  text: string
  confidence: number
  finalizedAt: number
}
