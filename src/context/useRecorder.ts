import { useContext } from 'react'
import { RecorderContext } from './RecorderContext'

export function useRecorder() {
  const recorder = useContext(RecorderContext)
  if (!recorder) {
    throw new Error('useRecorder must be used inside RecorderProvider.')
  }
  return recorder
}
