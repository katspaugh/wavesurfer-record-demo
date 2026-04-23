/** Wires WaveSurfer recording, chunk persistence, playback loading, and transcript regions. */
import { type Dispatch, type MutableRefObject, useCallback, useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { CHUNK_TIMESLICE_MS, MAX_RECORDING_MS, getSupportedRecordingMimeType } from '../lib/audio'
import { saveChunk } from '../lib/chunkDb'
import { createRandomTranscriptRegionColor } from '../lib/transcriptRegionColor'
import { createStoredChunk } from '../services/recordingService'
import type { RecorderAction } from '../state/recorderReducer'
import type { RecordingSession, RecordingStatus, TranscriptSegment } from '../types'

type UseWaveSurferRecorderOptions = {
  activeSessionRef: MutableRefObject<RecordingSession | null>
  chunkSequenceRef: MutableRefObject<number>
  commitSessionUpdate: (patch: Partial<RecordingSession>) => Promise<void>
  dispatch: Dispatch<RecorderAction>
  elapsedMsRef: MutableRefObject<number>
  onFinalizeRecording: (blob: Blob, durationMs: number, mimeType: string) => Promise<void>
  recordedUrl: string | null
  refreshQueueStats: () => Promise<unknown>
  refreshSessionChunks: (sessionId: string | undefined | null) => Promise<unknown>
  replaceRecordedUrl: (nextUrl: string | null) => void
  sessionIdRef: MutableRefObject<string>
  startLiveTranscription: () => void
  status: RecordingStatus
  stopLiveTranscription: () => void
  transcriptSegments: TranscriptSegment[] | undefined
  view: 'sessions' | 'recorder'
  waveformMountKey: number
}

export function useWaveSurferRecorder({
  activeSessionRef,
  chunkSequenceRef,
  commitSessionUpdate,
  dispatch,
  elapsedMsRef,
  onFinalizeRecording,
  recordedUrl,
  refreshQueueStats,
  refreshSessionChunks,
  replaceRecordedUrl,
  sessionIdRef,
  startLiveTranscription,
  status,
  stopLiveTranscription,
  transcriptSegments,
  view,
  waveformMountKey,
}: UseWaveSurferRecorderOptions) {
  const waveformRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const recorderRef = useRef<ReturnType<typeof RecordPlugin.create> | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const regionColorsRef = useRef<Map<string, string>>(new Map())
  const renderRegions = useCallback((segments: TranscriptSegment[]) => {
    const regions = regionsRef.current
    if (!regions) return

    const nextRegionColors = new Map<string, string>()
    for (const segment of segments) {
      nextRegionColors.set(
        segment.id,
        regionColorsRef.current.get(segment.id) ?? createRandomTranscriptRegionColor(),
      )
    }
    regionColorsRef.current = nextRegionColors

    regions.clearRegions()
    for (const segment of segments) {
      if (!segment.text.trim() || segment.endMs <= segment.startMs) continue
      const content = document.createElement('span')
      content.textContent = segment.text
      content.style.display = 'block'
      content.style.maxWidth = '100%'
      content.style.overflow = 'hidden'
      content.style.padding = '3px 6px'
      content.style.color = '#17211d'
      content.style.fontSize = '11px'
      content.style.fontWeight = '800'
      content.style.textOverflow = 'ellipsis'
      content.style.whiteSpace = 'nowrap'
      regions.addRegion({
        color: regionColorsRef.current.get(segment.id) ?? createRandomTranscriptRegionColor(),
        content,
        drag: false,
        end: segment.endMs / 1000,
        id: segment.id,
        resize: false,
        start: segment.startMs / 1000,
      })
    }
  }, [])

  useEffect(() => {
    if (view !== 'recorder' || !waveformRef.current) return

    const supportedMimeType = getSupportedRecordingMimeType()
    dispatch({ type: 'set-mime-type', mimeType: supportedMimeType || 'browser default' })

    const wavesurfer = WaveSurfer.create({
      barGap: 3,
      barRadius: 3,
      barWidth: 2,
      container: waveformRef.current,
      cursorWidth: 0,
      height: 184,
      normalize: false,
      progressColor: '#15392f',
      waveColor: '#9fb0a5',
    })

    const recorder = wavesurfer.registerPlugin(
      RecordPlugin.create({
        audioBitsPerSecond: 128_000,
        continuousWaveform: true,
        continuousWaveformDuration: 28,
        mediaRecorderTimeslice: CHUNK_TIMESLICE_MS,
        mimeType: supportedMimeType || undefined,
        renderRecordedAudio: false,
        scrollingWaveform: false,
        scrollingWaveformWindow: 14,
      }),
    )
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create())
    regionsRef.current = regions
    renderRegions(activeSessionRef.current?.transcript?.segments ?? [])

    recorder.on('record-start', () => {
      renderRegions([])
      dispatch({ type: 'set-status', status: 'recording' })
      dispatch({ type: 'set-error', error: null })
      startLiveTranscription()
      void commitSessionUpdate({ status: 'recording' })
    })

    recorder.on('record-pause', () => {
      stopLiveTranscription()
      dispatch({ type: 'set-status', status: 'paused' })
      void commitSessionUpdate({ status: 'paused' })
    })

    recorder.on('record-resume', () => {
      dispatch({ type: 'set-status', status: 'recording' })
      startLiveTranscription()
      void commitSessionUpdate({ status: 'recording' })
    })

    recorder.on('record-progress', (durationMs) => {
      elapsedMsRef.current = durationMs
      dispatch({ type: 'set-elapsed-ms', elapsedMs: durationMs })
      if (durationMs >= MAX_RECORDING_MS && recorder.isRecording()) {
        recorder.stopRecording()
      }
    })

    recorder.on('record-data-available', (blob) => {
      if (blob.size === 0) return

      const chunk = createStoredChunk({
        blob,
        fallbackType: supportedMimeType || 'audio/webm',
        id: crypto.randomUUID(),
        now: Date.now(),
        sequence: chunkSequenceRef.current,
        sessionId: sessionIdRef.current,
      })

      chunkSequenceRef.current += 1
      void saveChunk(chunk).then(async () => {
        await commitSessionUpdate({
          chunkCount: chunk.sequence + 1,
          mimeType: chunk.type,
        })
        await Promise.all([refreshQueueStats(), refreshSessionChunks(chunk.sessionId)])
      }).catch(() => {
        dispatch({ type: 'set-error', error: 'IndexedDB could not store the latest audio chunk.' })
      })
    })

    recorder.on('record-end', (blob) => {
      stopLiveTranscription()
      dispatch({ type: 'set-status', status: 'stopped' })
      dispatch({ type: 'set-recorded-blob', blob })
      replaceRecordedUrl(URL.createObjectURL(blob))
      void onFinalizeRecording(
        blob,
        recorder.getDuration(),
        blob.type || supportedMimeType || 'audio/webm',
      ).catch(() => {
        dispatch({ type: 'set-error', error: 'IndexedDB could not store the finalized recording.' })
      })
    })

    wavesurfer.on('play', () => dispatch({ type: 'set-preview-playing', isPreviewPlaying: true }))
    wavesurfer.on('pause', () => dispatch({ type: 'set-preview-playing', isPreviewPlaying: false }))
    wavesurfer.on('finish', () => {
      wavesurfer.setTime(0)
      dispatch({ type: 'set-preview-playing', isPreviewPlaying: false })
    })

    wavesurferRef.current = wavesurfer
    recorderRef.current = recorder

    return () => {
      recorder.destroy()
      wavesurfer.destroy()
      wavesurferRef.current = null
      recorderRef.current = null
      regionsRef.current = null
      regionColorsRef.current.clear()
    }
  }, [
    activeSessionRef,
    chunkSequenceRef,
    commitSessionUpdate,
    dispatch,
    elapsedMsRef,
    onFinalizeRecording,
    refreshQueueStats,
    refreshSessionChunks,
    renderRegions,
    replaceRecordedUrl,
    sessionIdRef,
    startLiveTranscription,
    stopLiveTranscription,
    view,
    waveformMountKey,
  ])

  useEffect(() => {
    const wavesurfer = wavesurferRef.current
    if (view !== 'recorder' || !wavesurfer || !recordedUrl || (status !== 'stopped' && status !== 'paused')) return

    let isCancelled = false
    dispatch({ type: 'set-preview-playing', isPreviewPlaying: false })
    wavesurfer.setOptions({
      cursorWidth: 1,
      interact: true,
      normalize: false,
    })

    void wavesurfer.load(recordedUrl).then(() => {
      if (!isCancelled) {
        wavesurfer.setTime(0)
        renderRegions(transcriptSegments ?? [])
      }
    }).catch(() => {
      if (!isCancelled) dispatch({ type: 'set-error', error: 'Recorded audio could not be loaded into the waveform.' })
    })

    return () => {
      isCancelled = true
    }
  }, [dispatch, recordedUrl, renderRegions, status, transcriptSegments, view])

  return {
    recorderRef,
    renderRegions,
    waveformRef,
    wavesurferRef,
  }
}
