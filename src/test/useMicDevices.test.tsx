// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/micService', async () => {
  const actual = await vi.importActual<typeof import('../services/micService')>('../services/micService')
  return {
    ...actual,
    listMicrophones: vi.fn(),
    requestMicrophoneStream: vi.fn(),
    stopStream: vi.fn(),
  }
})

import { useMicDevices } from '../hooks/useMicDevices'
import { listMicrophones, requestMicrophoneStream, stopStream } from '../services/micService'

const listMock = vi.mocked(listMicrophones)
const requestMock = vi.mocked(requestMicrophoneStream)
const stopMock = vi.mocked(stopStream)

type DeviceChangeListener = () => void
let deviceChangeListeners: DeviceChangeListener[] = []

const originalMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  'mediaDevices',
)

beforeEach(() => {
  listMock.mockReset()
  requestMock.mockReset()
  stopMock.mockReset()
  deviceChangeListeners = []
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      addEventListener: (event: string, handler: DeviceChangeListener) => {
        if (event === 'devicechange') deviceChangeListeners.push(handler)
      },
      removeEventListener: (event: string, handler: DeviceChangeListener) => {
        if (event === 'devicechange') {
          deviceChangeListeners = deviceChangeListeners.filter((h) => h !== handler)
        }
      },
    },
  })
})

afterEach(() => {
  cleanup()
  if (originalMediaDevicesDescriptor) {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', originalMediaDevicesDescriptor)
  } else {
    Reflect.deleteProperty(globalThis.navigator, 'mediaDevices')
  }
})

describe('useMicDevices', () => {
  it('lists devices on mount and selects the first one', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        { deviceId: 'a', label: 'USB Mic' },
        { deviceId: 'b', label: 'Built-in' },
      ],
    })
    const { result } = renderHook(() => useMicDevices())

    await waitFor(() => {
      expect(result.current.state.micDevices).toHaveLength(2)
    })
    expect(result.current.state.selectedDeviceId).toBe('a')
  })

  it('records mic errors when listing fails', async () => {
    listMock.mockResolvedValue({
      ok: false,
      error: { code: 'unsupported', message: 'no devices' },
    })
    const { result } = renderHook(() => useMicDevices())

    await waitFor(() => {
      expect(result.current.state.micError?.code).toBe('unsupported')
    })
  })

  it('toggleProcessing flips a processing flag', async () => {
    listMock.mockResolvedValue({ ok: true, value: [] })
    const { result } = renderHook(() => useMicDevices())

    expect(result.current.state.micProcessing.echoCancellation).toBe(true)
    act(() => result.current.actions.toggleProcessing('echoCancellation'))
    expect(result.current.state.micProcessing.echoCancellation).toBe(false)
  })

  it('selectDevice updates selection and releases the active stream', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [{ deviceId: 'a', label: 'A' }, { deviceId: 'b', label: 'B' }],
    })
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream
    requestMock.mockResolvedValue({ ok: true, value: fakeStream })

    const { result } = renderHook(() => useMicDevices())
    await waitFor(() => expect(result.current.state.selectedDeviceId).toBe('a'))

    await act(async () => {
      await result.current.actions.acquireStream()
    })
    expect(stopMock).not.toHaveBeenCalled()

    act(() => result.current.actions.selectDevice('b'))
    expect(result.current.state.selectedDeviceId).toBe('b')
    expect(stopMock).toHaveBeenCalledWith(fakeStream)
  })

  it('acquireStream marks permission granted and refreshes the device list', async () => {
    listMock.mockResolvedValueOnce({ ok: true, value: [] })
    listMock.mockResolvedValue({
      ok: true,
      value: [{ deviceId: 'a', label: 'USB Mic' }],
    })
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream
    requestMock.mockResolvedValue({ ok: true, value: fakeStream })

    const { result } = renderHook(() => useMicDevices())
    await waitFor(() => expect(result.current.state.micDevices).toHaveLength(0))

    let acquired: MediaStream | null = null
    await act(async () => {
      acquired = await result.current.actions.acquireStream()
    })

    expect(acquired).toBe(fakeStream)
    expect(result.current.state.permissionGranted).toBe(true)
    await waitFor(() => expect(result.current.state.micDevices).toHaveLength(1))
  })

  it('acquireStream surfaces a mic error and returns null on failure', async () => {
    listMock.mockResolvedValue({ ok: true, value: [] })
    requestMock.mockResolvedValue({
      ok: false,
      error: { code: 'permission-denied', message: 'no' },
    })

    const { result } = renderHook(() => useMicDevices())

    let acquired: MediaStream | null | undefined
    await act(async () => {
      acquired = await result.current.actions.acquireStream()
    })

    expect(acquired).toBeNull()
    expect(result.current.state.micError?.code).toBe('permission-denied')
    expect(result.current.state.permissionGranted).toBe(false)
  })

  it('releaseStream stops the active stream and clears the reference', async () => {
    listMock.mockResolvedValue({ ok: true, value: [] })
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream
    requestMock.mockResolvedValue({ ok: true, value: fakeStream })

    const { result } = renderHook(() => useMicDevices())

    await act(async () => {
      await result.current.actions.acquireStream()
    })
    act(() => result.current.actions.releaseStream())

    expect(stopMock).toHaveBeenCalledWith(fakeStream)

    stopMock.mockClear()
    act(() => result.current.actions.releaseStream())
    expect(stopMock).not.toHaveBeenCalled()
  })

  it('refreshes devices when navigator emits devicechange', async () => {
    listMock.mockResolvedValueOnce({ ok: true, value: [] })
    listMock.mockResolvedValue({
      ok: true,
      value: [{ deviceId: 'x', label: 'New Mic' }],
    })

    const { result } = renderHook(() => useMicDevices())
    await waitFor(() => expect(listMock).toHaveBeenCalled())

    await act(async () => {
      deviceChangeListeners.forEach((h) => h())
    })

    await waitFor(() => {
      expect(result.current.state.micDevices.some((d) => d.deviceId === 'x')).toBe(true)
    })
  })
})
