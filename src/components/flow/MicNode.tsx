import { Handle, Position } from '@xyflow/react'
import type { MicProcessingOption } from '../../services/micService'
import type { PipelineState } from '../../hooks/usePipeline'
import styles from './nodeStyles.module.css'

const MIC_OPTIONS: { option: MicProcessingOption; label: string }[] = [
  { option: 'noiseSuppression', label: 'Noise filtering' },
  { option: 'echoCancellation', label: 'Echo cancellation' },
  { option: 'autoGainControl', label: 'Auto gain' },
]

export type MicNodeData = {
  state: PipelineState
  onSelectDevice: (deviceId: string) => void
  onToggleProcessing: (option: MicProcessingOption) => void
  onRefreshDevices: () => void
}

export function MicNode({ data }: { data: MicNodeData }) {
  const { state, onSelectDevice, onToggleProcessing, onRefreshDevices } = data
  const isLive = state.status === 'recording' || state.status === 'paused'
  const dotClass = state.micError
    ? styles.statusErr
    : state.permissionGranted
      ? styles.statusOk
      : styles.statusIdle

  return (
    <div className={styles.node}>
      <header className={styles.header}>
        <h2>Step 1</h2>
        <h3>Microphone — getUserMedia</h3>
      </header>
      <div className={styles.body}>
      <div className={styles.statusRow}>
        <span className={`${styles.statusDot} ${dotClass}`} />
        <span>
          {state.micError
            ? 'Permission needed'
            : state.permissionGranted
              ? 'Stream ready'
              : 'Not requested yet'}
        </span>
      </div>
      <p>
        Calls <code>navigator.mediaDevices.getUserMedia</code> with the constraints
        configured here. Device labels appear after the user grants permission.
      </p>

      <label className={styles.field} htmlFor="mic-device">Input device</label>
      <select
        id="mic-device"
        className={`${styles.select} nodrag`}
        value={state.selectedDeviceId}
        disabled={isLive}
        onChange={(event) => onSelectDevice(event.target.value)}
      >
        {state.micDevices.length === 0 ? (
          <option value="">Default microphone</option>
        ) : (
          state.micDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))
        )}
      </select>

      <span className={styles.field}>Constraints</span>
      {MIC_OPTIONS.map(({ option, label }) => (
        <label key={option} className={`${styles.toggleRow} nodrag`}>
          <span>{label}</span>
          <input
            type="checkbox"
            checked={state.micProcessing[option]}
            disabled={isLive}
            onChange={() => onToggleProcessing(option)}
          />
        </label>
      ))}

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSecondary} nodrag`}
          onClick={onRefreshDevices}
        >
          Refresh devices
        </button>
      </div>

      {state.micError ? (
        <div className={styles.errorBox} role="alert">
          <strong>{state.micError.code}: </strong>
          {state.micError.message}
        </div>
      ) : null}

      <Handle type="source" position={Position.Right} />
      </div>
    </div>
  )
}
