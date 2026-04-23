import { createContext } from 'react'
import type { useRecorderApp } from '../hooks/useRecorderApp'

export type RecorderContextValue = ReturnType<typeof useRecorderApp>

export const RecorderContext = createContext<RecorderContextValue | null>(null)
