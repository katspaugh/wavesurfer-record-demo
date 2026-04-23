import { type Dispatch, type RefObject, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { downloadBlob } from '../lib/audio'
import { encodeMp3Blob } from '../services/audioExportService'
import type { Mp3BitRate, Mp3ChannelCount, Mp3ExportSettings } from '../services/mp3EncoderCore'
import type { RecorderAction } from '../state/recorderReducer'

type UseMp3ExportOptions = {
  dispatch: Dispatch<RecorderAction>
  durationMs: number
  mp3ExportSettings: Mp3ExportSettings
  recordedBlob: Blob | null
  wavesurferRef: RefObject<WaveSurfer | null>
}

export function useMp3Export({
  dispatch,
  durationMs,
  mp3ExportSettings,
  recordedBlob,
  wavesurferRef,
}: UseMp3ExportOptions) {
  const exportMp3 = useCallback(async () => {
    if (!recordedBlob) return

    wavesurferRef.current?.pause()
    dispatch({ type: 'set-preview-playing', isPreviewPlaying: false })
    dispatch({ type: 'set-exporting', isExporting: true })
    dispatch({ type: 'set-export-progress', exportProgress: 0.04 })
    dispatch({ type: 'set-status', status: 'processing' })
    dispatch({ type: 'set-error', error: null })

    try {
      const mp3Blob = await encodeMp3Blob(
        recordedBlob,
        mp3ExportSettings,
        durationMs,
        (exportProgress) => {
          dispatch({ type: 'set-export-progress', exportProgress })
        },
      )
      dispatch({ type: 'set-export-progress', exportProgress: 1 })
      downloadBlob(mp3Blob, `field-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.mp3`)
    } catch (exportError) {
      dispatch({ type: 'set-error', error: exportError instanceof Error ? exportError.message : 'MP3 conversion failed.' })
    } finally {
      dispatch({ type: 'set-exporting', isExporting: false })
      dispatch({ type: 'set-status', status: 'stopped' })
      window.setTimeout(() => dispatch({ type: 'set-export-progress', exportProgress: 0 }), 800)
    }
  }, [dispatch, durationMs, mp3ExportSettings, recordedBlob, wavesurferRef])

  const setMp3BitRate = useCallback((bitRate: Mp3BitRate) => {
    dispatch({ type: 'set-mp3-bit-rate', bitRate })
  }, [dispatch])

  const setMp3ChannelCount = useCallback((channelCount: Mp3ChannelCount) => {
    dispatch({ type: 'set-mp3-channel-count', channelCount })
  }, [dispatch])

  return {
    exportMp3,
    setMp3BitRate,
    setMp3ChannelCount,
  }
}
