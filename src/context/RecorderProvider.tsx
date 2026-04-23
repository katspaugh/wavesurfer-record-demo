import type { ReactNode } from 'react'
import { useRecorderApp } from '../hooks/useRecorderApp'
import { RecorderContext } from './RecorderContext'

export function RecorderProvider({ children }: { children: ReactNode }) {
  const recorder = useRecorderApp()

  return (
    <RecorderContext.Provider value={recorder}>
      {children}
    </RecorderContext.Provider>
  )
}
