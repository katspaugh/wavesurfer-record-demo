export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped' | 'processing'

export type ChunkMetadata = {
  id: string
  sessionId: string
  sequence: number
  createdAt: number
  size: number
  type: string
}

export type StoredChunk = ChunkMetadata & {
  blob: Blob
}

export type QueueStats = {
  chunks: number
  bytes: number
  sessions: number
}

export type TranscriptSegment = {
  id: string
  text: string
  confidence: number
  startMs: number
  endMs: number
}

export type TranscriptResult = {
  id: string
  text: string
  confidence: number
  createdAt: number
  segments: TranscriptSegment[]
}

export type RecordingSessionStatus = 'draft' | 'recording' | 'paused' | 'stopped'

export type RecordingSession = {
  id: string
  title: string
  status: RecordingSessionStatus
  createdAt: number
  updatedAt: number
  durationMs: number
  size: number
  mimeType: string
  chunkCount: number
  transcript?: TranscriptResult
}
