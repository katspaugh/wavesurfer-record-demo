/** Orchestrates the recording pipeline: mic, recorder, IDB queue, export, transcription. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { downloadBlob, MAX_EXPORT_DURATION_MS, MAX_RECORDING_MS } from '../lib/audio'
import {
  createSession,
  deleteSession,
  getQueueSnapshotForSession,
  saveChunk,
  type ChunkMetadata,
  type LoadedSession,
  type SessionMeta,
  type StoredChunk,
} from '../lib/db'
import { appError, isErr, type AppError } from '../lib/result'
import { encodeMp3 } from '../services/audioExportService'
import {
  CHUNK_TIMESLICE_MS,
  pickSupportedMimeType,
  startMediaRecorder,
  type RecorderHandle,
} from '../services/mediaRecorderService'
import {
  DEFAULT_MIC_PROCESSING,
  listMicrophones,
  requestMicrophoneStream,
  stopStream,
  type MicDevice,
  type MicProcessing,
  type MicProcessingOption,
} from '../services/micService'
import {
  DEFAULT_MP3_EXPORT_SETTINGS,
  type Mp3BitRate,
  type Mp3ChannelCount,
  type Mp3ExportSettings,
} from '../services/mp3EncoderCore'
import { startLiveTranscription, type SpeechHandle } from '../services/speechRecognitionService'
import type { RecordingStatus, TranscriptSegment } from '../types'

export type RecentQueueEvent = {
  id: string
  kind: 'enqueue' | 'drain'
  size: number
  sequence: number
  at: number
}

export type PipelineState = {
  status: RecordingStatus
  mimeType: string
  elapsedMs: number
  micDevices: MicDevice[]
  selectedDeviceId: string
  micProcessing: MicProcessing
  micError: AppError | null
  permissionGranted: boolean
  recorderError: AppError | null
  queueChunks: ChunkMetadata[]
  queueBytes: number
  recentQueueEvents: RecentQueueEvent[]
  finalBlob: Blob | null
  finalUrl: string | null
  exportError: AppError | null
  exportProgress: number
  isExporting: boolean
  mp3Settings: Mp3ExportSettings
  transcriptSegments: TranscriptSegment[]
  partialTranscript: string
  transcriptionActive: boolean
  transcriptionError: AppError | null
}

const MAX_QUEUE_EVENTS = 8

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function defaultDraftTitle(now: number): string {
  return `Recording — ${new Date(now).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })}`
}

export type FinalizedTake = {
  sessionId: string
  blob: Blob
  mimeType: string
  durationMs: number
  transcript: TranscriptSegment[]
}

export type UsePipelineOptions = {
  initialSession?: LoadedSession | null
  onTakeFinalized?: (take: FinalizedTake) => void
}

export function usePipeline(options: UsePipelineOptions = {}) {
  const { initialSession, onTakeFinalized } = options
  const [status, setStatus] = useState<RecordingStatus>(initialSession ? 'stopped' : 'idle')
  const [mimeType, setMimeType] = useState<string>(
    initialSession?.mimeType ?? pickSupportedMimeType() ?? 'browser default',
  )
  const [elapsedMs, setElapsedMs] = useState(initialSession?.durationMs ?? 0)
  const [micDevices, setMicDevices] = useState<MicDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [micProcessing, setMicProcessing] = useState<MicProcessing>(DEFAULT_MIC_PROCESSING)
  const [micError, setMicError] = useState<AppError | null>(null)
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false)
  const [recorderError, setRecorderError] = useState<AppError | null>(null)
  const [queueChunks, setQueueChunks] = useState<ChunkMetadata[]>([])
  const [queueBytes, setQueueBytes] = useState(0)
  const [recentQueueEvents, setRecentQueueEvents] = useState<RecentQueueEvent[]>([])
  const [finalBlob, setFinalBlob] = useState<Blob | null>(initialSession?.blob ?? null)
  const [finalUrl, setFinalUrl] = useState<string | null>(() =>
    initialSession ? URL.createObjectURL(initialSession.blob) : null,
  )
  // Track every URL handed to setFinalUrl so unmount can revoke whichever one is current,
  // including the URL minted in the lazy initializer above.
  const pendingBlobUrlRef = useRef<string | null>(finalUrl)
  const [exportError, setExportError] = useState<AppError | null>(null)
  const [exportProgress, setExportProgress] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [mp3Settings, setMp3Settings] = useState<Mp3ExportSettings>(DEFAULT_MP3_EXPORT_SETTINGS)
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>(
    initialSession?.transcript ?? [],
  )
  const [partialTranscript, setPartialTranscript] = useState('')
  const [transcriptionActive, setTranscriptionActive] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<AppError | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<RecorderHandle | null>(null)
  const speechRef = useRef<SpeechHandle | null>(null)
  const chunkSequenceRef = useRef(0)
  const tickRef = useRef<number | null>(null)
  const startedAtRef = useRef<number>(0)
  const accumulatedMsRef = useRef<number>(initialSession?.durationMs ?? 0)
  const takeFinalSegmentsRef = useRef<TranscriptSegment[]>([])
  const activeSessionIdRef = useRef<string | null>(null)
  // Mirror of the partial transcript so stopRecording can flush it as a final segment
  // even if SpeechRecognition is torn down before the engine emits its own finalization.
  const partialTranscriptRef = useRef<string>('')

  const refreshDevices = useCallback(async () => {
    const result = await listMicrophones()
    if (result.ok) {
      setMicDevices(result.value)
      if (!selectedDeviceId && result.value[0]) {
        setSelectedDeviceId(result.value[0].deviceId)
      }
    } else {
      setMicError(result.error)
    }
  }, [selectedDeviceId])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) {
      // refreshDevices runs after a microtask, so updates land outside this effect's commit.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void refreshDevices()
      return undefined
    }
    const handler = () => void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', handler)
    handler()
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler)
  }, [refreshDevices])

  useEffect(() => {
    if (!initialSession) return
    void (async () => {
      const snapshot = await getQueueSnapshotForSession(initialSession.id)
      if (snapshot.ok) {
        setQueueChunks(snapshot.value.chunks)
        setQueueBytes(snapshot.value.bytes)
        const events = [...snapshot.value.chunks]
          .sort((a, b) => a.sequence - b.sequence || a.createdAt - b.createdAt)
          .slice(-MAX_QUEUE_EVENTS)
          .map<RecentQueueEvent>((chunk) => ({
            id: chunk.id,
            kind: 'enqueue',
            size: chunk.size,
            sequence: chunk.sequence,
            at: chunk.createdAt,
          }))
        setRecentQueueEvents(events)
      }
    })()
  }, [initialSession])

  useEffect(() => () => {
    // Unmount: stop everything still alive so navigating away doesn't leave the mic open
    // or the recording timer ticking, and revoke any object URL we created.
    recorderRef.current?.stop()
    recorderRef.current = null
    speechRef.current?.stop()
    speechRef.current = null
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    stopStream(streamRef.current)
    streamRef.current = null
    if (pendingBlobUrlRef.current) {
      URL.revokeObjectURL(pendingBlobUrlRef.current)
      pendingBlobUrlRef.current = null
    }
  }, [])

  const stopTimer = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    startedAtRef.current = nowMs()
    tickRef.current = window.setInterval(() => {
      setElapsedMs(accumulatedMsRef.current + (nowMs() - startedAtRef.current))
    }, 200)
  }, [stopTimer])

  const pauseTimer = useCallback(() => {
    stopTimer()
    accumulatedMsRef.current += nowMs() - startedAtRef.current
    setElapsedMs(accumulatedMsRef.current)
  }, [stopTimer])

  const recordQueueEvent = useCallback((event: RecentQueueEvent) => {
    setRecentQueueEvents((events) => [...events, event].slice(-MAX_QUEUE_EVENTS))
  }, [])

  const handleChunk = useCallback(async (blob: Blob, mime: string) => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId) return
    const chunk: StoredChunk = {
      id: crypto.randomUUID(),
      sessionId,
      sequence: chunkSequenceRef.current,
      createdAt: Date.now(),
      size: blob.size,
      type: mime,
      blob,
    }
    chunkSequenceRef.current += 1

    const result = await saveChunk(chunk)
    if (isErr(result)) {
      setRecorderError(result.error)
      return
    }

    setQueueChunks((current) => [...current, {
      id: chunk.id,
      sessionId: chunk.sessionId,
      sequence: chunk.sequence,
      createdAt: chunk.createdAt,
      size: chunk.size,
      type: chunk.type,
    }])
    setQueueBytes((current) => current + chunk.size)
    recordQueueEvent({
      id: chunk.id,
      kind: 'enqueue',
      size: chunk.size,
      sequence: chunk.sequence,
      at: Date.now(),
    })
  }, [recordQueueEvent])

  const teardownStream = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
  }, [])

  const teardownTranscription = useCallback(() => {
    speechRef.current?.stop()
    speechRef.current = null
    setTranscriptionActive(false)
  }, [])

  const beginTranscription = useCallback(() => {
    if (speechRef.current) return
    setTranscriptionError(null)
    partialTranscriptRef.current = ''
    setPartialTranscript('')
    const handle = startLiveTranscription({
      onPartial: (text) => {
        partialTranscriptRef.current = text
        setPartialTranscript(text)
      },
      onFinal: (text, confidence) => {
        partialTranscriptRef.current = ''
        setPartialTranscript('')
        const segment: TranscriptSegment = {
          id: crypto.randomUUID(),
          text,
          confidence,
          finalizedAt: Date.now(),
        }
        takeFinalSegmentsRef.current = [...takeFinalSegmentsRef.current, segment]
        setTranscriptSegments((segments) => [...segments, segment])
      },
      onError: (error) => {
        setTranscriptionError(error)
        setTranscriptionActive(false)
      },
      onEnd: () => setTranscriptionActive(false),
    })

    if (handle.ok) {
      speechRef.current = handle.value
      setTranscriptionActive(true)
    } else {
      setTranscriptionError(handle.error)
    }
  }, [])

  const startRecording = useCallback(async () => {
    setRecorderError(null)
    setMicError(null)
    setExportError(null)
    setStatus('requesting-mic')

    if (!streamRef.current) {
      const result = await requestMicrophoneStream({
        deviceId: selectedDeviceId || undefined,
        processing: micProcessing,
      })
      if (isErr(result)) {
        setMicError(result.error)
        setStatus('idle')
        return
      }
      streamRef.current = result.value
      setPermissionGranted(true)
      // Refresh device labels now that permission is granted.
      void refreshDevices()
    }

    if (pendingBlobUrlRef.current) {
      URL.revokeObjectURL(pendingBlobUrlRef.current)
      pendingBlobUrlRef.current = null
      setFinalUrl(null)
    }
    setFinalBlob(null)
    setTranscriptSegments([])
    setPartialTranscript('')
    partialTranscriptRef.current = ''
    takeFinalSegmentsRef.current = []
    accumulatedMsRef.current = 0
    setElapsedMs(0)
    chunkSequenceRef.current = 0

    const sessionId = crypto.randomUUID()
    activeSessionIdRef.current = sessionId
    setQueueChunks([])
    setQueueBytes(0)
    setRecentQueueEvents([])

    const draftCreatedAt = Date.now()
    const draft: SessionMeta = {
      id: sessionId,
      title: defaultDraftTitle(draftCreatedAt),
      createdAt: draftCreatedAt,
      updatedAt: draftCreatedAt,
      durationMs: 0,
      size: 0,
      mimeType: pickSupportedMimeType() || 'audio/webm',
      transcript: [],
      finalized: false,
    }
    const created = await createSession(draft)
    if (isErr(created)) {
      setRecorderError(created.error)
      setStatus('idle')
      return
    }

    const recorder = startMediaRecorder(streamRef.current, {
      onChunk: (blob, mime) => void handleChunk(blob, mime),
      onStateChange: (recorderState) => {
        if (recorderState === 'recording') setStatus('recording')
        else if (recorderState === 'paused') setStatus('paused')
      },
      onError: (error) => setRecorderError(error),
      onStop: (blob, mime) => {
        const url = URL.createObjectURL(blob)
        if (pendingBlobUrlRef.current) URL.revokeObjectURL(pendingBlobUrlRef.current)
        pendingBlobUrlRef.current = url
        setFinalBlob(blob)
        setFinalUrl(url)
        setMimeType(mime)
        setStatus('stopped')
        // Flush any in-flight partial as a final segment so a stop that races the
        // SpeechRecognition flush does not silently drop visible-but-not-finalized text.
        const trailingPartial = partialTranscriptRef.current.trim()
        if (trailingPartial) {
          const segment: TranscriptSegment = {
            id: crypto.randomUUID(),
            text: trailingPartial,
            confidence: 0,
            finalizedAt: Date.now(),
          }
          takeFinalSegmentsRef.current = [...takeFinalSegmentsRef.current, segment]
          setTranscriptSegments((segments) => [...segments, segment])
          partialTranscriptRef.current = ''
          setPartialTranscript('')
        }
        onTakeFinalized?.({
          sessionId,
          blob,
          mimeType: mime,
          durationMs: accumulatedMsRef.current,
          transcript: takeFinalSegmentsRef.current,
        })
      },
    }, CHUNK_TIMESLICE_MS)

    if (isErr(recorder)) {
      setRecorderError(recorder.error)
      setStatus('idle')
      void deleteSession(sessionId)
      return
    }

    recorderRef.current = recorder.value
    setMimeType(recorder.value.mimeType)
    startTimer()
    beginTranscription()
  }, [beginTranscription, handleChunk, micProcessing, onTakeFinalized, refreshDevices, selectedDeviceId, startTimer])

  const pauseRecording = useCallback(() => {
    const handle = recorderRef.current
    if (!handle) return
    const result = handle.pause()
    if (isErr(result)) {
      setRecorderError(result.error)
      return
    }
    pauseTimer()
    teardownTranscription()
  }, [pauseTimer, teardownTranscription])

  const resumeRecording = useCallback(() => {
    const handle = recorderRef.current
    if (!handle) return
    const result = handle.resume()
    if (isErr(result)) {
      setRecorderError(result.error)
      return
    }
    startTimer()
    beginTranscription()
  }, [beginTranscription, startTimer])

  const stopRecording = useCallback(() => {
    const handle = recorderRef.current
    if (!handle) return
    const result = handle.stop()
    if (isErr(result)) {
      setRecorderError(result.error)
      return
    }
    recorderRef.current = null
    pauseTimer()
    teardownTranscription()
    teardownStream()
  }, [pauseTimer, teardownStream, teardownTranscription])

  // Auto-stop when the active recording reaches the configured cap so MediaRecorder
  // can never run unbounded. Fires at most once per take when elapsedMs crosses the threshold.
  useEffect(() => {
    if (status !== 'recording') return
    if (elapsedMs < MAX_RECORDING_MS) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecorderError(appError(
      'invalid-state',
      `Recording stopped at the ${Math.round(MAX_RECORDING_MS / 60_000)}-minute cap.`,
    ))
    stopRecording()
  }, [elapsedMs, status, stopRecording])

  const toggleProcessing = useCallback((option: MicProcessingOption) => {
    setMicProcessing((current) => ({ ...current, [option]: !current[option] }))
  }, [])

  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
    teardownStream()
  }, [teardownStream])

  const exportMp3 = useCallback(async () => {
    if (!finalBlob) return
    const durationMs = accumulatedMsRef.current
    if (durationMs > MAX_EXPORT_DURATION_MS) {
      setExportError(appError(
        'invalid-state',
        `MP3 export is capped at ${Math.round(MAX_EXPORT_DURATION_MS / 60_000)} minutes. Trim the recording before exporting.`,
      ))
      return
    }
    setIsExporting(true)
    setExportError(null)
    setExportProgress(0)

    const result = await encodeMp3(finalBlob, mp3Settings, setExportProgress)
    setIsExporting(false)
    if (isErr(result)) {
      setExportError(result.error)
      return
    }

    setExportProgress(1)
    downloadBlob(result.value, `recording-${Date.now()}.mp3`)
  }, [finalBlob, mp3Settings])

  const setBitRate = useCallback((bitRate: Mp3BitRate) => {
    setMp3Settings((current) => ({ ...current, bitRate }))
  }, [])

  const setChannelCount = useCallback((channelCount: Mp3ChannelCount) => {
    setMp3Settings((current) => ({ ...current, channelCount }))
  }, [])

  const state: PipelineState = {
    status,
    mimeType,
    elapsedMs,
    micDevices,
    selectedDeviceId,
    micProcessing,
    micError,
    permissionGranted,
    recorderError,
    queueChunks,
    queueBytes,
    recentQueueEvents,
    finalBlob,
    finalUrl,
    exportError,
    exportProgress,
    isExporting,
    mp3Settings,
    transcriptSegments,
    partialTranscript,
    transcriptionActive,
    transcriptionError,
  }

  return {
    state,
    actions: {
      startRecording,
      pauseRecording,
      resumeRecording,
      stopRecording,
      toggleProcessing,
      selectDevice,
      exportMp3,
      setBitRate,
      setChannelCount,
      refreshDevices,
    },
  }
}
