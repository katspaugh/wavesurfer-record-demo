import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listMicrophones, requestMicrophoneStream } from '../services/micService'

type MediaDevicesMock = {
  enumerateDevices: ReturnType<typeof vi.fn>
  getUserMedia: ReturnType<typeof vi.fn>
}

const originalNavigator = globalThis.navigator

function setMediaDevices(mock: MediaDevicesMock | null) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: mock ? { mediaDevices: mock } : {},
  })
}

beforeEach(() => {
  setMediaDevices({
    enumerateDevices: vi.fn(),
    getUserMedia: vi.fn(),
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: originalNavigator,
  })
})

describe('micService', () => {
  it('returns unsupported when mediaDevices is absent', async () => {
    setMediaDevices(null)
    const result = await listMicrophones()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unsupported')
  })

  it('lists audioinput devices and provides fallback labels', async () => {
    const mock = navigator.mediaDevices as unknown as MediaDevicesMock
    mock.enumerateDevices.mockResolvedValue([
      { deviceId: 'a', kind: 'audioinput', label: 'USB Mic' },
      { deviceId: 'b', kind: 'audioinput', label: '' },
      { deviceId: 'v', kind: 'videoinput', label: 'Camera' },
    ])

    const result = await listMicrophones()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual([
        { deviceId: 'a', label: 'USB Mic' },
        { deviceId: 'b', label: 'Microphone 2' },
      ])
    }
  })

  it('classifies permission errors', async () => {
    const mock = navigator.mediaDevices as unknown as MediaDevicesMock
    const error = Object.assign(new Error('blocked'), { name: 'NotAllowedError' })
    mock.getUserMedia.mockRejectedValue(error)

    const result = await requestMicrophoneStream({
      deviceId: undefined,
      processing: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('permission-denied')
  })

  it('passes deviceId and processing constraints to getUserMedia', async () => {
    const mock = navigator.mediaDevices as unknown as MediaDevicesMock
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream
    mock.getUserMedia.mockResolvedValue(fakeStream)

    const result = await requestMicrophoneStream({
      deviceId: 'mic-1',
      processing: { autoGainControl: false, echoCancellation: true, noiseSuppression: false },
    })

    expect(result.ok).toBe(true)
    expect(mock.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: false,
        echoCancellation: true,
        noiseSuppression: false,
        deviceId: { exact: 'mic-1' },
      },
    })
  })
})
