/** Orchestrates recorder state, session lifecycle, waveform control, and export actions. */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { MAX_RECORDING_MS } from '../lib/audio'
import {
  clearChunks,
  deleteChunksForSession,
  getSessionBlob,
  saveSession,
} from '../lib/chunkDb'
import {
  createDraftSession,
  findSessionFromQuery,
  getChunkBytes,
  setSessionQuery,
} from '../services/sessionService'
import {
  buildSessionBlobFromChunks,
  persistFinalizedSession,
  prepareSessionForFreshRecording,
} from '../services/sessionRecordingService'
import { initialRecorderState, recorderReducer, type MicProcessingOption } from '../state/recorderReducer'
import type { RecordingSession } from '../types'
import { useLiveTranscription } from './useLiveTranscription'
import { useMp3Export } from './useMp3Export'
import { useRecorderPersistence } from './useRecorderPersistence'
import { useWaveSurferRecorder } from './useWaveSurferRecorder'

export function useRecorderApp() {
  const recordedUrlRef = useRef<string | null>(null)
  const handleTranscriptSegmentsChange = useCallback(() => undefined, [])

  const [state, dispatch] = useReducer(recorderReducer, initialRecorderState)
  const {
    activeSessionRef,
    chunkSequenceRef,
    commitSessionUpdate,
    elapsedMsRef,
    getElapsedMs,
    refreshQueueStats,
    refreshSessionChunks,
    refreshSessions,
    removeSession: removePersistedSession,
    sessionIdRef,
  } = useRecorderPersistence({
    activeSession: state.activeSession,
    dispatch,
    elapsedMs: state.elapsedMs,
  })

  const canRecord = useMemo(() => Boolean(navigator.mediaDevices && window.MediaRecorder), [])
  const statusLabel = state.status === 'idle' ? 'ready' : state.status
  const remainingMs = Math.max(0, MAX_RECORDING_MS - state.elapsedMs)
  const isFinalized = state.status === 'stopped' && Boolean(state.recordedBlob)
  const sessionCacheBytes = useMemo(() => getChunkBytes(state.sessionChunks), [state.sessionChunks])

  const replaceRecordedUrl = useCallback((nextUrl: string | null) => {
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
    recordedUrlRef.current = nextUrl
    dispatch({ type: 'set-recorded-url', url: nextUrl })
  }, [])

  const {
    resetLiveTranscription,
    setTranscriptBaseline,
    startLiveTranscription,
    stopLiveTranscription,
  } = useLiveTranscription({
    commitSessionUpdate,
    dispatch,
    getElapsedMs,
    onTranscriptSegmentsChange: handleTranscriptSegmentsChange,
  })

  const handleFinalizeRecording = useCallback(async (blob: Blob, durationMs: number, mimeType: string) => {
    const currentSession = activeSessionRef.current
    if (!currentSession) return
    const finalizedBlob = await buildSessionBlobFromChunks(currentSession.id, blob)
    if (!finalizedBlob) return

    const { cacheState, session } = await persistFinalizedSession({
      blob: finalizedBlob,
      durationMs,
      mimeType,
      session: currentSession,
    })

    activeSessionRef.current = session
    dispatch({ type: 'set-recorded-blob', blob: finalizedBlob })
    replaceRecordedUrl(URL.createObjectURL(finalizedBlob))
    dispatch({ type: 'upsert-session', session })
    dispatch({ type: 'set-session-chunks', chunks: cacheState.chunks })
    dispatch({ type: 'set-queue-stats', stats: cacheState.queueStats })
  }, [activeSessionRef, replaceRecordedUrl])

  const {
    recorderRef,
    renderRegions,
    waveformRef,
    wavesurferRef,
  } = useWaveSurferRecorder({
    activeSessionRef,
    chunkSequenceRef,
    commitSessionUpdate,
    dispatch,
    elapsedMsRef,
    onFinalizeRecording: handleFinalizeRecording,
    recordedUrl: state.recordedUrl,
    refreshQueueStats,
    refreshSessionChunks,
    replaceRecordedUrl,
    sessionIdRef,
    startLiveTranscription,
    status: state.status,
    stopLiveTranscription,
    transcriptSegments: state.transcript?.segments,
    view: state.view,
    waveformMountKey: state.waveformMountKey,
  })

  useEffect(() => {
    renderRegions(state.transcript?.segments ?? [])
  }, [renderRegions, state.transcript?.segments])

  const {
    exportMp3,
    setMp3BitRate,
    setMp3ChannelCount,
  } = useMp3Export({
    dispatch,
    durationMs: state.activeSession?.durationMs ?? state.elapsedMs,
    mp3ExportSettings: state.mp3ExportSettings,
    recordedBlob: state.recordedBlob,
    wavesurferRef,
  })

  const resetRecorderOutput = useCallback(() => {
    wavesurferRef.current?.pause()
    replaceRecordedUrl(null)
    resetLiveTranscription()
    dispatch({ type: 'reset-recorder-output' })
  }, [replaceRecordedUrl, resetLiveTranscription, wavesurferRef])

  const openSession = useCallback((session: RecordingSession) => {
    wavesurferRef.current?.pause()
    wavesurferRef.current?.setTime(0)
    dispatch({ type: 'set-preview-playing', isPreviewPlaying: false })
    activeSessionRef.current = session
    sessionIdRef.current = session.id
    chunkSequenceRef.current = session.chunkCount
    dispatch({ type: 'set-active-session', session })
    dispatch({ type: 'set-view', view: 'recorder' })
    dispatch({
      type: 'set-status',
      status: session.status === 'stopped'
        ? 'stopped'
        : session.status === 'paused' || session.status === 'recording'
          ? 'paused'
          : 'idle',
    })
    dispatch({ type: 'set-elapsed-ms', elapsedMs: session.durationMs })
    dispatch({ type: 'set-transcript', transcript: session.transcript ?? null })
    setTranscriptBaseline(
      session.transcript?.text ?? '',
      session.transcript?.confidence ?? 0,
      session.transcript?.segments ?? [],
    )
    dispatch({ type: 'set-recorded-blob', blob: null })
    replaceRecordedUrl(null)
    setSessionQuery(session.id, window.location, window.history)
    dispatch({ type: 'set-error', error: null })
    void refreshSessionChunks(session.id)
    if (session.status === 'stopped') {
      void getSessionBlob(session.id).then((blob) => {
        if (!blob || activeSessionRef.current?.id !== session.id) return
        dispatch({ type: 'set-recorded-blob', blob })
        replaceRecordedUrl(URL.createObjectURL(blob))
      })
    } else if (session.chunkCount > 0) {
      void buildSessionBlobFromChunks(session.id).then((blob) => {
        if (!blob || activeSessionRef.current?.id !== session.id) return
        dispatch({ type: 'set-recorded-blob', blob })
        replaceRecordedUrl(URL.createObjectURL(blob))
      })
    }
  }, [activeSessionRef, chunkSequenceRef, refreshSessionChunks, replaceRecordedUrl, sessionIdRef, setTranscriptBaseline, wavesurferRef])

  const createSession = useCallback(async () => {
    const session = createDraftSession({
      id: crypto.randomUUID(),
      mimeType: state.mimeType,
      now: Date.now(),
      sessionCount: state.sessions.length,
    })

    await saveSession(session)
    dispatch({ type: 'upsert-session', session })
    resetRecorderOutput()
    openSession(session)
  }, [openSession, resetRecorderOutput, state.mimeType, state.sessions.length])

  const closeRecorder = useCallback(() => {
    recorderRef.current?.stopMic()
    stopLiveTranscription()
    dispatch({ type: 'set-view', view: 'sessions' })
    dispatch({ type: 'set-active-session', session: null })
    activeSessionRef.current = null
    dispatch({ type: 'set-status', status: 'idle' })
    dispatch({ type: 'set-session-chunks', chunks: [] })
    resetRecorderOutput()
    setSessionQuery(null, window.location, window.history)
    void refreshSessions()
  }, [activeSessionRef, recorderRef, refreshSessions, resetRecorderOutput, stopLiveTranscription])

  const removeSession = useCallback(async (sessionId: string) => {
    await deleteChunksForSession(sessionId)
    await removePersistedSession(sessionId)
  }, [removePersistedSession])

  useEffect(() => {
    if (state.view !== 'sessions' || state.sessions.length === 0) return

    const session = findSessionFromQuery(state.sessions, window.location.search)
    if (session) openSession(session)
  }, [openSession, state.sessions, state.view])

  useEffect(() => {
    return () => {
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
    }
  }, [])

  const beginRecording = useCallback(async (mode: 'fresh' | 'resume') => {
    const recorder = recorderRef.current
    if (!recorder || !canRecord || !activeSessionRef.current) return
    if (activeSessionRef.current.status === 'stopped') {
      dispatch({ type: 'set-error', error: 'This session is finalized. Start a new session for another recording.' })
      return
    }

    try {
      const currentSession = activeSessionRef.current
      sessionIdRef.current = currentSession.id
      dispatch({ type: 'set-recorded-blob', blob: null })
      wavesurferRef.current?.pause()
      wavesurferRef.current?.empty()
      renderRegions([])
      dispatch({ type: 'set-preview-playing', isPreviewPlaying: false })
      replaceRecordedUrl(null)
      dispatch({ type: 'set-error', error: null })
      if (mode === 'fresh') {
        chunkSequenceRef.current = 0
        dispatch({ type: 'set-transcript', transcript: null })
        setTranscriptBaseline('', 0, [])
        dispatch({ type: 'set-elapsed-ms', elapsedMs: 0 })
        const { cacheState, session } = await prepareSessionForFreshRecording(currentSession)
        activeSessionRef.current = session
        dispatch({ type: 'upsert-session', session })
        dispatch({ type: 'set-session-chunks', chunks: cacheState.chunks })
        dispatch({ type: 'set-queue-stats', stats: cacheState.queueStats })
      } else {
        chunkSequenceRef.current = currentSession.chunkCount
      }
      await recorder.startRecording({
        echoCancellation: state.micProcessing.echoCancellation,
        noiseSuppression: state.micProcessing.noiseSuppression,
        autoGainControl: state.micProcessing.autoGainControl,
      })
    } catch (recordingError) {
      dispatch({ type: 'set-error', error: recordingError instanceof Error ? recordingError.message : 'Microphone access failed.' })
      dispatch({ type: 'set-status', status: 'idle' })
    }
  }, [activeSessionRef, canRecord, chunkSequenceRef, recorderRef, renderRegions, replaceRecordedUrl, sessionIdRef, setTranscriptBaseline, state.micProcessing, wavesurferRef])

  const startRecording = useCallback(async () => {
    await beginRecording('fresh')
  }, [beginRecording])

  const pauseRecording = useCallback(() => recorderRef.current?.pauseRecording(), [recorderRef])
  const resumeRecording = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) return

    if (typeof recorder.isPaused === 'function' && recorder.isPaused()) {
      recorder.resumeRecording()
      return
    }

    await beginRecording('resume')
  }, [beginRecording, recorderRef])
  const stopRecording = useCallback(() => recorderRef.current?.stopRecording(), [recorderRef])

  const toggleMicProcessing = useCallback((option: MicProcessingOption) => {
    dispatch({ type: 'toggle-mic-processing', option })
  }, [])

  const togglePreview = useCallback(async () => {
    const wavesurfer = wavesurferRef.current
    const canPreview = state.status === 'stopped' || state.status === 'paused'
    if (!wavesurfer || !state.recordedUrl || !canPreview) return

    if (wavesurfer.isPlaying()) {
      wavesurfer.pause()
      dispatch({ type: 'set-preview-playing', isPreviewPlaying: false })
      return
    }

    try {
      dispatch({ type: 'set-error', error: null })
      await wavesurfer.playPause()
      dispatch({ type: 'set-preview-playing', isPreviewPlaying: true })
    } catch {
      dispatch({ type: 'set-error', error: 'Audio preview could not start.' })
      dispatch({ type: 'set-preview-playing', isPreviewPlaying: false })
    }
  }, [state.recordedUrl, state.status, wavesurferRef])

  const clearOfflineQueue = useCallback(async () => {
    if (!state.activeSession) {
      await clearChunks()
      await refreshQueueStats()
      await refreshSessionChunks(null)
      return
    }

    await deleteChunksForSession(state.activeSession.id)
    await Promise.all([refreshQueueStats(), refreshSessionChunks(state.activeSession.id)])
    await commitSessionUpdate({ chunkCount: 0 })
  }, [commitSessionUpdate, refreshQueueStats, refreshSessionChunks, state.activeSession])

  return {
    ...state,
    canRecord,
    clearOfflineQueue,
    closeRecorder,
    createSession,
    exportMp3,
    isFinalized,
    openSession,
    pauseRecording,
    remainingMs,
    removeSession,
    resumeRecording,
    sessionCacheBytes,
    setMp3BitRate,
    setMp3ChannelCount,
    startRecording,
    statusLabel,
    stopRecording,
    toggleMicProcessing,
    togglePreview,
    waveformRef,
  }
}
