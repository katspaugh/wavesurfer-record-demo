/** MP3 export slice: encoder settings, progress, and the export action. */
import { useCallback, useReducer } from 'react'
import { downloadBlob, MAX_EXPORT_DURATION_MS } from '../lib/audio'
import { appError, isErr, type AppError } from '../lib/result'
import { encodeMp3 } from '../services/audioExportService'
import {
  DEFAULT_MP3_EXPORT_SETTINGS,
  type Mp3BitRate,
  type Mp3ChannelCount,
  type Mp3ExportSettings,
} from '../services/mp3EncoderCore'

export type Mp3ExportState = {
  mp3Settings: Mp3ExportSettings
  exportProgress: number
  isExporting: boolean
  exportError: AppError | null
}

type Action =
  | { type: 'set-bit-rate'; bitRate: Mp3BitRate }
  | { type: 'set-channel-count'; channelCount: Mp3ChannelCount }
  | { type: 'export-start' }
  | { type: 'export-progress'; progress: number }
  | { type: 'export-success' }
  | { type: 'export-failure'; error: AppError }
  | { type: 'reset-export-status' }

const initialState: Mp3ExportState = {
  mp3Settings: DEFAULT_MP3_EXPORT_SETTINGS,
  exportProgress: 0,
  isExporting: false,
  exportError: null,
}

function reducer(state: Mp3ExportState, action: Action): Mp3ExportState {
  switch (action.type) {
    case 'set-bit-rate':
      return { ...state, mp3Settings: { ...state.mp3Settings, bitRate: action.bitRate } }
    case 'set-channel-count':
      return { ...state, mp3Settings: { ...state.mp3Settings, channelCount: action.channelCount } }
    case 'export-start':
      return { ...state, isExporting: true, exportProgress: 0, exportError: null }
    case 'export-progress':
      return { ...state, exportProgress: action.progress }
    case 'export-success':
      return { ...state, isExporting: false, exportProgress: 1, exportError: null }
    case 'export-failure':
      return { ...state, isExporting: false, exportError: action.error }
    case 'reset-export-status':
      return { ...state, exportProgress: 0, exportError: null, isExporting: false }
  }
}

export function useMp3Export() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const setBitRate = useCallback((bitRate: Mp3BitRate) => {
    dispatch({ type: 'set-bit-rate', bitRate })
  }, [])

  const setChannelCount = useCallback((channelCount: Mp3ChannelCount) => {
    dispatch({ type: 'set-channel-count', channelCount })
  }, [])

  const resetExportStatus = useCallback(() => dispatch({ type: 'reset-export-status' }), [])

  const exportMp3 = useCallback(async (blob: Blob | null, durationMs: number) => {
    if (!blob) return
    if (durationMs > MAX_EXPORT_DURATION_MS) {
      dispatch({
        type: 'export-failure',
        error: appError(
          'invalid-state',
          `MP3 export is capped at ${Math.round(MAX_EXPORT_DURATION_MS / 60_000)} minutes. Trim the recording before exporting.`,
        ),
      })
      return
    }

    dispatch({ type: 'export-start' })
    const result = await encodeMp3(blob, state.mp3Settings, (progress) => {
      dispatch({ type: 'export-progress', progress })
    })
    if (isErr(result)) {
      dispatch({ type: 'export-failure', error: result.error })
      return
    }
    dispatch({ type: 'export-success' })
    downloadBlob(result.value, `recording-${Date.now()}.mp3`)
  }, [state.mp3Settings])

  return {
    state,
    actions: { exportMp3, setBitRate, setChannelCount, resetExportStatus },
  }
}
