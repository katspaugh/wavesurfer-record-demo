// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { clearChunks, deleteSession, listSessions } from '../lib/chunkDb'

beforeEach(async () => {
  Object.defineProperty(window, 'MediaRecorder', {
    configurable: true,
    value: class MediaRecorder {},
  })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {},
  })
  window.history.replaceState(null, '', '/')
  await clearChunks()
  for (const session of await listSessions()) {
    await deleteSession(session.id)
  }
})

afterEach(() => {
  cleanup()
})

describe('App', () => {
  it('wires the recorder provider into the session library', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Recording Sessions' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New Session' })).toBeTruthy()
  })
})
