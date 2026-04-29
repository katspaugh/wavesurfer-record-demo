/** Recorder slice: MediaRecorder lifecycle, elapsed timer, chunk queue, and final blob. */
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { MAX_RECORDING_MS } from '../lib/audio'
import {
  getQueueSnapshotForSession,
  saveChunk,
  type ChunkMetadata,
  type LoadedSession,
  type StoredChunk,
} from '../lib/db'
import { appError, isErr, type AppError, type Result } from '../lib/result'
import {
  CHUNK_TIMESLICE_MS,
  pickSupportedMimeType,
  startMediaRecorder,
  type RecorderHandle,
} from '../services/mediaRecorderService'
import type { RecordingStatus } from '../types'

export type RecentQueueEvent = {
  id: string
  kind: 'enqueue' | 'drain'
  size: number
  sequence: number
  at: number
}

export type RecorderSliceState = {
  status: RecordingStatus
  mimeType: string
  elapsedMs: number
  queueChunks: ChunkMetadata[]
  queueBytes: number
  recentQueueEvents: RecentQueueEvent[]
  finalBlob: Blob | null
  finalUrl: string | null
  recorderError: AppError | null
}

const MAX_QUEUE_EVENTS = 8

type Action =
  | { type: 'mark-requesting-mic' }
  | { type: 'mark-idle' }
  | { type: 'recorder-started' }
  | { type: 'recorder-paused' }
  | { type: 'recorder-resumed' }
  | { type: 'recorder-stopped'; blob: Blob; url: string; mimeType: string }
  | { type: 'chunk-enqueued'; chunk: ChunkMetadata; event: RecentQueueEvent }
  | { type: 'queue-snapshot'; chunks: ChunkMetadata[]; bytes: number; events: RecentQueueEvent[] }
  | { type: 'queue-cleared' }
  | { type: 'preview-cleared' }
  | { type: 'mime-type'; mimeType: string }
  | { type: 'tick'; elapsedMs: number }
  | { type: 'reset-elapsed' }
  | { type: 'recorder-error'; error: AppError }

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function makeInitialState(initialSession?: LoadedSession | null): RecorderSliceState {
  const seededUrl = initialSession ? URL.createObjectURL(initialSession.blob) : null
  return {
    status: initialSession ? 'stopped' : 'idle',
    mimeType: initialSession?.mimeType ?? pickSupportedMimeType() ?? 'browser default',
    elapsedMs: initialSession?.durationMs ?? 0,
    queueChunks: [],
    queueBytes: 0,
    recentQueueEvents: [],
    finalBlob: initialSession?.blob ?? null,
    finalUrl: seededUrl,
    recorderError: null,
  }
}

function reducer(state: RecorderSliceState, action: Action): RecorderSliceState {
  switch (action.type) {
    case 'mark-requesting-mic':
      return { ...state, status: 'requesting-mic', recorderError: null }
    case 'mark-idle':
      return { ...state, status: 'idle' }
    case 'recorder-started':
      return { ...state, status: 'recording' }
    case 'recorder-paused':
      return { ...state, status: 'paused' }
    case 'recorder-resumed':
      return { ...state, status: 'recording' }
    case 'recorder-stopped':
      return {
        ...state,
        status: 'stopped',
        finalBlob: action.blob,
        finalUrl: action.url,
        mimeType: action.mimeType,
      }
    case 'chunk-enqueued':
      return {
        ...state,
        queueChunks: [...state.queueChunks, action.chunk],
        queueBytes: state.queueBytes + action.chunk.size,
        recentQueueEvents: [...state.recentQueueEvents, action.event].slice(-MAX_QUEUE_EVENTS),
      }
    case 'queue-snapshot':
      return {
        ...state,
        queueChunks: action.chunks,
        queueBytes: action.bytes,
        recentQueueEvents: action.events,
      }
    case 'queue-cleared':
      return { ...state, queueChunks: [], queueBytes: 0, recentQueueEvents: [] }
    case 'preview-cleared':
      return { ...state, finalBlob: null, finalUrl: null }
    case 'mime-type':
      return { ...state, mimeType: action.mimeType }
    case 'tick':
      return { ...state, elapsedMs: action.elapsedMs }
    case 'reset-elapsed':
      return { ...state, elapsedMs: 0 }
    case 'recorder-error':
      return { ...state, recorderError: action.error }
  }
}

export type UseRecorderOptions = {
  initialSession?: LoadedSession | null
}

export type StartArgs = {
  stream: MediaStream
  sessionId: string
  onStop?: (info: { blob: Blob; mimeType: string; durationMs: number }) => void
}

export function useRecorder(options: UseRecorderOptions = {}) {
  const initialSession = options.initialSession ?? null
  const [state, dispatch] = useReducer(reducer, initialSession, makeInitialState)

  const recorderRef = useRef<RecorderHandle | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const chunkSequenceRef = useRef(0)
  const tickRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const accumulatedMsRef = useRef(initialSession?.durationMs ?? 0)
  const pendingBlobUrlRef = useRef<string | null>(state.finalUrl)
  const onStopRef = useRef<StartArgs['onStop']>(undefined)

  // Load the queue snapshot for a seeded session so the queue node reflects what's on disk.
  useEffect(() => {
    if (!initialSession) return
    void (async () => {
      const snapshot = await getQueueSnapshotForSession(initialSession.id)
      if (!snapshot.ok) return
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
      dispatch({
        type: 'queue-snapshot',
        chunks: snapshot.value.chunks,
        bytes: snapshot.value.bytes,
        events,
      })
    })()
  }, [initialSession])

  useEffect(() => () => {
    recorderRef.current?.stop()
    recorderRef.current = null
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
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
      dispatch({
        type: 'tick',
        elapsedMs: accumulatedMsRef.current + (nowMs() - startedAtRef.current),
      })
    }, 200)
  }, [stopTimer])

  const pauseTimer = useCallback(() => {
    stopTimer()
    accumulatedMsRef.current += nowMs() - startedAtRef.current
    dispatch({ type: 'tick', elapsedMs: accumulatedMsRef.current })
  }, [stopTimer])

  const handleChunk = useCallback(async (blob: Blob, mime: string) => {
    const sessionId = sessionIdRef.current
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
      dispatch({ type: 'recorder-error', error: result.error })
      return
    }
    const metadata: ChunkMetadata = {
      id: chunk.id,
      sessionId: chunk.sessionId,
      sequence: chunk.sequence,
      createdAt: chunk.createdAt,
      size: chunk.size,
      type: chunk.type,
    }
    dispatch({
      type: 'chunk-enqueued',
      chunk: metadata,
      event: {
        id: chunk.id,
        kind: 'enqueue',
        size: chunk.size,
        sequence: chunk.sequence,
        at: chunk.createdAt,
      },
    })
  }, [])

  const start = useCallback(async (args: StartArgs): Promise<Result<void, AppError>> => {
    if (pendingBlobUrlRef.current) {
      URL.revokeObjectURL(pendingBlobUrlRef.current)
      pendingBlobUrlRef.current = null
    }
    dispatch({ type: 'preview-cleared' })
    dispatch({ type: 'queue-cleared' })
    dispatch({ type: 'reset-elapsed' })
    accumulatedMsRef.current = 0
    chunkSequenceRef.current = 0
    sessionIdRef.current = args.sessionId
    onStopRef.current = args.onStop

    const recorder = startMediaRecorder(args.stream, {
      onChunk: (blob, mime) => void handleChunk(blob, mime),
      onStateChange: (recorderState) => {
        if (recorderState === 'recording') dispatch({ type: 'recorder-started' })
        else if (recorderState === 'paused') dispatch({ type: 'recorder-paused' })
      },
      onError: (error) => dispatch({ type: 'recorder-error', error }),
      onStop: (blob, mime) => {
        const url = URL.createObjectURL(blob)
        if (pendingBlobUrlRef.current) URL.revokeObjectURL(pendingBlobUrlRef.current)
        pendingBlobUrlRef.current = url
        dispatch({ type: 'recorder-stopped', blob, url, mimeType: mime })
        onStopRef.current?.({ blob, mimeType: mime, durationMs: accumulatedMsRef.current })
      },
    }, CHUNK_TIMESLICE_MS)

    if (isErr(recorder)) {
      dispatch({ type: 'recorder-error', error: recorder.error })
      dispatch({ type: 'mark-idle' })
      return recorder
    }

    recorderRef.current = recorder.value
    dispatch({ type: 'mime-type', mimeType: recorder.value.mimeType })
    startTimer()
    return { ok: true, value: undefined }
  }, [handleChunk, startTimer])

  const pause = useCallback(() => {
    const handle = recorderRef.current
    if (!handle) return
    const result = handle.pause()
    if (isErr(result)) {
      dispatch({ type: 'recorder-error', error: result.error })
      return
    }
    pauseTimer()
  }, [pauseTimer])

  const resume = useCallback(() => {
    const handle = recorderRef.current
    if (!handle) return
    const result = handle.resume()
    if (isErr(result)) {
      dispatch({ type: 'recorder-error', error: result.error })
      return
    }
    startTimer()
  }, [startTimer])

  const stop = useCallback(() => {
    const handle = recorderRef.current
    if (!handle) return
    const result = handle.stop()
    if (isErr(result)) {
      dispatch({ type: 'recorder-error', error: result.error })
      return
    }
    recorderRef.current = null
    pauseTimer()
  }, [pauseTimer])

  const markRequestingMic = useCallback(() => dispatch({ type: 'mark-requesting-mic' }), [])
  const markIdle = useCallback(() => dispatch({ type: 'mark-idle' }), [])

  // Auto-stop when the active recording reaches the configured cap.
  useEffect(() => {
    if (state.status !== 'recording') return
    if (state.elapsedMs < MAX_RECORDING_MS) return
    dispatch({
      type: 'recorder-error',
      error: appError(
        'invalid-state',
        `Recording stopped at the ${Math.round(MAX_RECORDING_MS / 60_000)}-minute cap.`,
      ),
    })
    stop()
  }, [state.elapsedMs, state.status, stop])

  return {
    state,
    actions: {
      start,
      pause,
      resume,
      stop,
      markRequestingMic,
      markIdle,
    },
  }
}
