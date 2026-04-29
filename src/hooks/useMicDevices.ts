/** Microphone slice: device enumeration, processing flags, and stream lifecycle. */
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { type AppError } from '../lib/result'
import {
  DEFAULT_MIC_PROCESSING,
  listMicrophones,
  requestMicrophoneStream,
  stopStream,
  type MicDevice,
  type MicProcessing,
  type MicProcessingOption,
} from '../services/micService'

export type MicDevicesState = {
  micDevices: MicDevice[]
  selectedDeviceId: string
  micProcessing: MicProcessing
  micError: AppError | null
  permissionGranted: boolean
}

type Action =
  | { type: 'devices-loaded'; devices: MicDevice[] }
  | { type: 'devices-failed'; error: AppError }
  | { type: 'select-device'; deviceId: string }
  | { type: 'toggle-processing'; option: MicProcessingOption }
  | { type: 'permission-granted' }
  | { type: 'mic-error'; error: AppError }

const initialState: MicDevicesState = {
  micDevices: [],
  selectedDeviceId: '',
  micProcessing: DEFAULT_MIC_PROCESSING,
  micError: null,
  permissionGranted: false,
}

function reducer(state: MicDevicesState, action: Action): MicDevicesState {
  switch (action.type) {
    case 'devices-loaded': {
      const selectedStillPresent = action.devices.some((d) => d.deviceId === state.selectedDeviceId)
      const fallback = action.devices[0]?.deviceId ?? ''
      return {
        ...state,
        micDevices: action.devices,
        selectedDeviceId: selectedStillPresent ? state.selectedDeviceId : fallback,
        micError: null,
      }
    }
    case 'devices-failed':
      return { ...state, micError: action.error }
    case 'select-device':
      return { ...state, selectedDeviceId: action.deviceId }
    case 'toggle-processing':
      return {
        ...state,
        micProcessing: { ...state.micProcessing, [action.option]: !state.micProcessing[action.option] },
      }
    case 'permission-granted':
      return { ...state, permissionGranted: true, micError: null }
    case 'mic-error':
      return { ...state, micError: action.error }
  }
}

export function useMicDevices() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const streamRef = useRef<MediaStream | null>(null)
  // Snapshot mic settings so callbacks don't need to depend on changing state.
  const settingsRef = useRef({
    selectedDeviceId: state.selectedDeviceId,
    micProcessing: state.micProcessing,
  })
  useEffect(() => {
    settingsRef.current = {
      selectedDeviceId: state.selectedDeviceId,
      micProcessing: state.micProcessing,
    }
  }, [state.selectedDeviceId, state.micProcessing])

  const refreshDevices = useCallback(async () => {
    const result = await listMicrophones()
    if (result.ok) dispatch({ type: 'devices-loaded', devices: result.value })
    else dispatch({ type: 'devices-failed', error: result.error })
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) {
      void refreshDevices()
      return undefined
    }
    const handler = () => void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', handler)
    handler()
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler)
  }, [refreshDevices])

  const releaseStream = useCallback(() => {
    if (!streamRef.current) return
    stopStream(streamRef.current)
    streamRef.current = null
  }, [])

  useEffect(() => () => {
    if (streamRef.current) {
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [])

  const acquireStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current
    const result = await requestMicrophoneStream({
      deviceId: settingsRef.current.selectedDeviceId || undefined,
      processing: settingsRef.current.micProcessing,
    })
    if (!result.ok) {
      dispatch({ type: 'mic-error', error: result.error })
      return null
    }
    streamRef.current = result.value
    dispatch({ type: 'permission-granted' })
    void refreshDevices()
    return result.value
  }, [refreshDevices])

  const selectDevice = useCallback((deviceId: string) => {
    dispatch({ type: 'select-device', deviceId })
    releaseStream()
  }, [releaseStream])

  const toggleProcessing = useCallback((option: MicProcessingOption) => {
    dispatch({ type: 'toggle-processing', option })
  }, [])

  return {
    state,
    actions: {
      refreshDevices,
      selectDevice,
      toggleProcessing,
      acquireStream,
      releaseStream,
    },
  }
}
