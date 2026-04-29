/** Composes the recorder pipeline: mic, recorder, transcription, MP3 export. */
import { useCallback, useEffect, useRef } from 'react'
import { createSession, deleteSession, type LoadedSession, type SessionMeta } from '../lib/db'
import { isErr } from '../lib/result'
import { pickSupportedMimeType } from '../services/mediaRecorderService'
import type { TranscriptSegment } from '../types'
import { useMicDevices } from './useMicDevices'
import { useMp3Export } from './useMp3Export'
import { useRecorder, type RecentQueueEvent } from './useRecorder'
import { useTranscription } from './useTranscription'

export type { RecentQueueEvent }

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

export type PipelineState = ReturnType<typeof usePipeline>['state']

function defaultDraftTitle(now: number): string {
  return `Recording — ${new Date(now).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })}`
}

export function usePipeline(options: UsePipelineOptions = {}) {
  const { initialSession, onTakeFinalized } = options

  const mic = useMicDevices()
  const recorder = useRecorder({ initialSession: initialSession ?? null })
  const transcription = useTranscription({ initialSegments: initialSession?.transcript ?? [] })
  const exporter = useMp3Export()

  // Mirror onTakeFinalized so the recorder's async onStop (set during start()) reads
  // the latest consumer callback instead of the closure captured when the take started.
  const onTakeFinalizedRef = useRef(onTakeFinalized)
  useEffect(() => {
    onTakeFinalizedRef.current = onTakeFinalized
  }, [onTakeFinalized])

  const startRecording = useCallback(async () => {
    recorder.actions.markRequestingMic()
    transcription.actions.resetForNewTake()
    exporter.actions.resetExportStatus()

    const stream = await mic.actions.acquireStream()
    if (!stream) {
      recorder.actions.markIdle()
      return
    }

    const sessionId = crypto.randomUUID()
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
      mic.actions.releaseStream()
      recorder.actions.markIdle(created.error)
      return
    }

    const result = await recorder.actions.start({
      stream,
      sessionId,
      onStop: ({ blob, mimeType, durationMs }) => {
        // Idempotent fallback: stopRecording() already runs these synchronously,
        // but auto-stop and direct stop calls also land here.
        transcription.actions.flushPartialAsFinal()
        transcription.actions.teardown()
        mic.actions.releaseStream()
        onTakeFinalizedRef.current?.({
          sessionId,
          blob,
          mimeType,
          durationMs,
          transcript: transcription.actions.getSegments(),
        })
      },
    })

    if (isErr(result)) {
      void deleteSession(sessionId)
      mic.actions.releaseStream()
      return
    }

    transcription.actions.begin()
  }, [exporter.actions, mic.actions, recorder.actions, transcription.actions])

  const pauseRecording = useCallback(() => {
    recorder.actions.pause()
    transcription.actions.teardown()
  }, [recorder.actions, transcription.actions])

  const resumeRecording = useCallback(() => {
    recorder.actions.resume()
    transcription.actions.begin()
  }, [recorder.actions, transcription.actions])

  const stopRecording = useCallback(() => {
    // Tear transcription down synchronously so SpeechRecognition can't keep
    // emitting partials while MediaRecorder.stop()'s async onstop is still in flight.
    // The mic stream is intentionally released only after the recorder finishes
    // flushing (in the onStop callback) — ending the tracks first risks dropping
    // the in-flight timeslice chunk on browsers that don't flush on track-end.
    transcription.actions.flushPartialAsFinal()
    transcription.actions.teardown()
    recorder.actions.stop()
  }, [recorder.actions, transcription.actions])

  const exportMp3 = useCallback(async () => {
    await exporter.actions.exportMp3(recorder.state.finalBlob, recorder.state.elapsedMs)
  }, [exporter.actions, recorder.state.elapsedMs, recorder.state.finalBlob])

  const state = {
    status: recorder.state.status,
    mimeType: recorder.state.mimeType,
    elapsedMs: recorder.state.elapsedMs,
    micDevices: mic.state.micDevices,
    selectedDeviceId: mic.state.selectedDeviceId,
    micProcessing: mic.state.micProcessing,
    micError: mic.state.micError,
    permissionGranted: mic.state.permissionGranted,
    recorderError: recorder.state.recorderError,
    queueChunks: recorder.state.queueChunks,
    queueBytes: recorder.state.queueBytes,
    recentQueueEvents: recorder.state.recentQueueEvents,
    finalBlob: recorder.state.finalBlob,
    finalUrl: recorder.state.finalUrl,
    exportError: exporter.state.exportError,
    exportProgress: exporter.state.exportProgress,
    isExporting: exporter.state.isExporting,
    mp3Settings: exporter.state.mp3Settings,
    transcriptSegments: transcription.state.transcriptSegments,
    partialTranscript: transcription.state.partialTranscript,
    transcriptionActive: transcription.state.transcriptionActive,
    transcriptionError: transcription.state.transcriptionError,
  }

  return {
    state,
    actions: {
      startRecording,
      pauseRecording,
      resumeRecording,
      stopRecording,
      toggleProcessing: mic.actions.toggleProcessing,
      selectDevice: mic.actions.selectDevice,
      exportMp3,
      setBitRate: exporter.actions.setBitRate,
      setChannelCount: exporter.actions.setChannelCount,
      refreshDevices: mic.actions.refreshDevices,
    },
  }
}
