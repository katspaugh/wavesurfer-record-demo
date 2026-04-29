import { useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { usePipeline, type FinalizedTake } from '../../hooks/usePipeline'
import type { LoadedSession } from '../../lib/db'
import { ExportNode } from './ExportNode'
import { HeapMonitorNode } from './HeapMonitorNode'
import { MicNode } from './MicNode'
import { QueueNode } from './QueueNode'
import { RecorderNode } from './RecorderNode'
import { TranscriptionNode } from './TranscriptionNode'

const nodeTypes: NodeTypes = {
  mic: MicNode,
  recorder: RecorderNode,
  queue: QueueNode,
  export: ExportNode,
  transcription: TranscriptionNode,
  heapMonitor: HeapMonitorNode,
}

const initialNodes: Node[] = [
  { id: 'mic', type: 'mic', position: { x: 0, y: 120 }, data: {} },
  { id: 'recorder', type: 'recorder', position: { x: 520, y: 0 }, data: {} },
  { id: 'queue', type: 'queue', position: { x: 1040, y: 80 }, data: {} },
  { id: 'transcription', type: 'transcription', position: { x: 500, y: 720 }, data: {} },
  { id: 'export', type: 'export', position: { x: 860, y: 600 }, data: {} },
  { id: 'heapMonitor', type: 'heapMonitor', position: { x: 0, y: 720 }, data: {} },
]

export type PipelineFlowProps = {
  initialSession?: LoadedSession | null
  onTakeFinalized?: (take: FinalizedTake) => void
  onBackToLibrary: () => void
}

export function PipelineFlow({ initialSession, onTakeFinalized, onBackToLibrary }: PipelineFlowProps) {
  const pipelineOptions = useMemo(() => ({
    ...(initialSession !== undefined ? { initialSession } : {}),
    ...(onTakeFinalized ? { onTakeFinalized } : {}),
  }), [initialSession, onTakeFinalized])
  const { state, actions } = usePipeline(pipelineOptions)
  const [storedNodes, , onNodesChange] = useNodesState<Node>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const dataById = useMemo<Record<string, Record<string, unknown>>>(() => ({
    mic: {
      state,
      onSelectDevice: actions.selectDevice,
      onToggleProcessing: actions.toggleProcessing,
      onRefreshDevices: () => void actions.refreshDevices(),
    },
    recorder: {
      state,
      onStart: () => void actions.startRecording(),
      onPause: actions.pauseRecording,
      onResume: actions.resumeRecording,
      onStop: actions.stopRecording,
    },
    queue: { state },
    export: {
      state,
      onExport: () => void actions.exportMp3(),
      onSetBitRate: actions.setBitRate,
      onSetChannelCount: actions.setChannelCount,
    },
    transcription: { state },
  }), [state, actions])

  const nodes = useMemo(
    () => storedNodes.map((node) => {
      const data = dataById[node.id]
      return data ? { ...node, data } : node
    }),
    [storedNodes, dataById],
  )

  useEffect(() => {
    const recordingActive = state.status === 'recording'
    const labelBgStyle = { fill: 'var(--paper)', fillOpacity: 0.95 }
    const labelBgPadding: [number, number] = [6, 4]
    const labelBgBorderRadius = 6
    setEdges([
      {
        id: 'mic-recorder',
        source: 'mic',
        target: 'recorder',
        animated: recordingActive,
        label: 'MediaStream',
        labelShowBg: true,
        labelBgStyle,
        labelBgPadding,
        labelBgBorderRadius,
      },
      {
        id: 'recorder-queue',
        source: 'recorder',
        sourceHandle: 'chunks',
        target: 'queue',
        animated: recordingActive,
        label: 'audio chunks (5s)',
        labelShowBg: true,
        labelBgStyle,
        labelBgPadding,
        labelBgBorderRadius,
      },
      {
        id: 'queue-export',
        source: 'queue',
        target: 'export',
        targetHandle: 'chunks',
        animated: state.isExporting,
        label: 'concatenated blob',
        labelShowBg: true,
        labelBgStyle,
        labelBgPadding,
        labelBgBorderRadius,
      },
      {
        id: 'recorder-transcription',
        source: 'recorder',
        sourceHandle: 'audio',
        target: 'transcription',
        animated: state.transcriptionActive,
        label: 'live audio (parallel)',
        style: { stroke: 'var(--blue)' },
        labelShowBg: true,
        labelBgStyle,
        labelBgPadding,
        labelBgBorderRadius,
      },
    ])
  }, [setEdges, state.isExporting, state.status, state.transcriptionActive])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <button
        type="button"
        onClick={onBackToLibrary}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          color: 'var(--ink)',
          cursor: 'pointer',
          font: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          left: 16,
          letterSpacing: '0.05em',
          padding: '8px 14px',
          position: 'absolute',
          textTransform: 'uppercase',
          top: 16,
          zIndex: 10,
        }}
      >
        ← Sessions
      </button>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1, minZoom: 0.7 }}
        minZoom={0.4}
        maxZoom={1.6}
        nodesDraggable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={32} color="rgba(23, 33, 29, 0.08)" />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
