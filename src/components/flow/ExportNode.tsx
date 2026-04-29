import { Handle, Position } from '@xyflow/react'
import { formatBytes } from '../../lib/audio'
import type { PipelineState } from '../../hooks/usePipeline'
import { MP3_BIT_RATES, type Mp3BitRate, type Mp3ChannelCount } from '../../services/mp3EncoderCore'
import styles from './nodeStyles.module.css'

export type ExportNodeData = {
  state: PipelineState
  onExport: () => void
  onSetBitRate: (bitRate: Mp3BitRate) => void
  onSetChannelCount: (channelCount: Mp3ChannelCount) => void
}

export function ExportNode({ data }: { data: ExportNodeData }) {
  const { state, onExport, onSetBitRate, onSetChannelCount } = data
  const hasBlob = Boolean(state.finalBlob)
  const dotClass = state.exportError
    ? styles.statusErr
    : state.isExporting
      ? styles.statusWarn
      : hasBlob
        ? styles.statusOk
        : styles.statusIdle

  return (
    <div className={styles.node}>
      <header className={styles.header}>
        <h2>Step 4</h2>
        <h3>Mediabunny → MP3</h3>
      </header>
      <div className={styles.body}>
      <div className={styles.statusRow}>
        <span className={`${styles.statusDot} ${dotClass}`} />
        <span>
          {state.isExporting
            ? `Encoding ${Math.round(state.exportProgress * 100)}%`
            : hasBlob
              ? `Take ready · ${formatBytes(state.finalBlob?.size ?? 0)}`
              : 'No take yet'}
        </span>
      </div>
      <p>
        Stops the pipeline by feeding the assembled blob into{' '}
        <code>Mediabunny</code> inside a Web Worker, then encodes MP3 via{' '}
        <code>@mediabunny/mp3-encoder</code>.
      </p>

      <label className={styles.field} htmlFor="mp3-bitrate">Bitrate</label>
      <select
        id="mp3-bitrate"
        className={`${styles.select} nodrag`}
        value={`${state.mp3Settings.bitRate}`}
        disabled={state.isExporting}
        onChange={(event) => onSetBitRate(Number(event.target.value) as Mp3BitRate)}
      >
        {MP3_BIT_RATES.map((bitRate) => (
          <option key={bitRate} value={bitRate}>{bitRate} kbps</option>
        ))}
      </select>

      <label className={styles.field} htmlFor="mp3-channels">Channels</label>
      <select
        id="mp3-channels"
        className={`${styles.select} nodrag`}
        value={`${state.mp3Settings.channelCount}`}
        disabled={state.isExporting}
        onChange={(event) => onSetChannelCount(Number(event.target.value) as Mp3ChannelCount)}
      >
        <option value="1">Mono</option>
        <option value="2">Stereo</option>
      </select>

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={`${styles.button} nodrag`}
          onClick={onExport}
          disabled={!hasBlob || state.isExporting}
        >
          {state.isExporting ? 'Encoding…' : 'Download MP3'}
        </button>
      </div>

      {state.finalUrl ? (
        <audio
          className={`${styles.audioPreview} nodrag`}
          controls
          src={state.finalUrl}
          preload="metadata"
        >
          Your browser cannot play recorded audio.
        </audio>
      ) : (
        <p className={styles.empty}>Audio preview appears after stop.</p>
      )}

      {state.exportError ? (
        <div className={styles.errorBox} role="alert">
          <strong>{state.exportError.code}: </strong>
          {state.exportError.message}
        </div>
      ) : null}

      <Handle type="target" position={Position.Top} id="chunks" />
      </div>
    </div>
  )
}
