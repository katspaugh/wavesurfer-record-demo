import { useMemo } from 'react'
import { useRecorder } from '../context/useRecorder'
import { formatBytes, formatDuration } from '../lib/audio'
import { MP3_BIT_RATES, type Mp3BitRate, type Mp3ChannelCount } from '../services/mp3EncoderCore'
import type { MicProcessingOption } from '../state/recorderReducer'
import styles from './App.module.css'
import { Icon } from './Icon'
import { Button, EmptyState, Panel, PanelHeader, ProgressBar, SegmentedControl, SelectField, StatGrid, StatItem, StatusPill, Toggle } from './ui'

const micProcessingLabels: Record<MicProcessingOption, string> = {
  echoCancellation: 'Echo cancellation',
  noiseSuppression: 'Noise filtering',
  autoGainControl: 'Auto gain',
}

export function RecorderView() {
  const { createSession, error, isFinalized } = useRecorder()

  return (
    <main className={styles.appShell}>
      <section className={styles.recorderStage} aria-labelledby="page-title">
        <RecorderHeader />
        <MeterGrid />
        <WavePanel />
        {error ? <p className={styles.errorBanner}>{error}</p> : null}
        <MicOptions />
        <ControlDeck />
        {isFinalized ? (
          <div className={styles.finalizedStrip}>
            <span>This session is finalized. Export it here, or start a fresh session for the next take.</span>
            <Button onClick={() => void createSession()}>
              <Icon name="record" />
              New Session
            </Button>
          </div>
        ) : null}
      </section>

      <section className={styles.workspace} aria-label="Exports and transcription">
        <ExportPanel />
        <TranscriptPanel />
        <QueuePanel />
      </section>
    </main>
  )
}

function RecorderHeader() {
  const { activeSession, closeRecorder, status, statusLabel } = useRecorder()

  return (
    <header className={styles.topbar}>
      <div>
        <p className={styles.eyebrow}>React Audio Recorder</p>
        <h1 className={styles.title} id="page-title">{activeSession?.title ?? 'Field Recorder'}</h1>
      </div>
      <div className={styles.topbarActions}>
        <Button onClick={closeRecorder} disabled={status === 'recording' || status === 'paused'}>
          Sessions
        </Button>
        <StatusPill label={statusLabel} status={status} />
      </div>
    </header>
  )
}

function MeterGrid() {
  const { activeSession, elapsedMs, mimeType, remainingMs } = useRecorder()

  return (
    <StatGrid ariaLabel="Recording stats">
      <StatItem label="Duration" value={formatDuration(elapsedMs)} />
      <StatItem label="Remaining" value={formatDuration(remainingMs)} />
      <StatItem label="Session chunks" value={`${activeSession?.chunkCount ?? 0} chunks`} />
      <StatItem label="Format" value={mimeType} />
    </StatGrid>
  )
}

function WavePanel() {
  const {
    canRecord,
    elapsedMs,
    isExporting,
    isFinalized,
    isPreviewPlaying,
    recordedBlob,
    recordedUrl,
    remainingMs,
    sessionCacheBytes,
    startRecording,
    status,
    togglePreview,
    waveformMountKey,
    waveformRef,
  } = useRecorder()

  return (
    <div className={styles.wavePanel}>
      <div className={styles.waveHeader}>
        <span>{recordedUrl ? 'Playback waveform' : 'Live waveform'}</span>
        <span>{formatBytes(sessionCacheBytes)} cached for this session</span>
      </div>
      <div className={styles.waveformFrame}>
        <div
          key={waveformMountKey}
          ref={waveformRef}
          className={styles.waveform}
          role="img"
          aria-label={`Audio waveform. Elapsed ${formatDuration(elapsedMs)}. Remaining ${formatDuration(remainingMs)}.`}
        />
        {!recordedUrl && status === 'idle' ? (
          <Button
            className={styles.waveRecordButton}
            variant="primary"
            onClick={() => void startRecording()}
            disabled={!canRecord || isFinalized}
          >
            <Icon name="record" />
            Record
          </Button>
        ) : null}
      </div>
      {recordedUrl ? (
        <div className={styles.previewStrip}>
          <span>Ready to preview</span>
          <Button
            aria-pressed={isPreviewPlaying}
            onClick={() => void togglePreview()}
            disabled={!recordedBlob || isExporting || (status !== 'stopped' && status !== 'paused')}
          >
            <Icon name={isPreviewPlaying ? 'pause' : 'play'} />
            {isPreviewPlaying ? 'Pause Preview' : 'Play Preview'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function MicOptions() {
  const { micProcessing, status, toggleMicProcessing } = useRecorder()

  return (
    <div className={styles.micOptions} aria-label="Microphone processing options">
      <span>Mic processing</span>
      {Object.entries(micProcessingLabels).map(([option, label]) => (
        <Toggle
          key={option}
          label={label}
          checked={micProcessing[option as MicProcessingOption]}
          disabled={status === 'recording' || status === 'paused'}
          onChange={() => toggleMicProcessing(option as MicProcessingOption)}
        />
      ))}
    </div>
  )
}

function ControlDeck() {
  const {
    pauseRecording,
    resumeRecording,
    status,
    stopRecording,
  } = useRecorder()

  return (
    <div className={styles.controlDeck} aria-label="Recording controls">
      <Button onClick={pauseRecording} disabled={status !== 'recording'}>
        <Icon name="pause" />
        Pause
      </Button>
      <Button onClick={() => void resumeRecording()} disabled={status !== 'paused'}>
        <Icon name="resume" />
        Resume
      </Button>
      <Button onClick={stopRecording} disabled={status !== 'recording' && status !== 'paused'}>
        <Icon name="stop" />
        Finish
      </Button>
    </div>
  )
}

function ExportPanel() {
  const {
    exportMp3,
    exportProgress,
    isExporting,
    mp3ExportSettings,
    recordedBlob,
    setMp3BitRate,
    setMp3ChannelCount,
  } = useRecorder()

  return (
    <Panel>
      <PanelHeader
        eyebrow="Export"
        title="MP3 package"
        meta={recordedBlob ? `${mp3ExportSettings.bitRate} kbps ${mp3ExportSettings.channelCount === 1 ? 'mono' : 'stereo'}` : 'No take'}
      />

      {!recordedBlob ? <EmptyState>Waiting for a finished recording</EmptyState> : null}

      <div className={styles.exportSettings} aria-label="MP3 export settings">
        <SelectField
          label="Bitrate"
          value={`${mp3ExportSettings.bitRate}`}
          disabled={isExporting}
          options={MP3_BIT_RATES.map((bitRate) => ({
            label: `${bitRate} kbps`,
            value: `${bitRate}`,
          }))}
          onChange={(value) => setMp3BitRate(Number(value) as Mp3BitRate)}
        />
        <div className={styles.channelSetting}>
          <span>Channels</span>
          <SegmentedControl
            ariaLabel="MP3 channel count"
            disabled={isExporting}
            value={`${mp3ExportSettings.channelCount}`}
            options={[
              { label: 'Mono', value: '1' },
              { label: 'Stereo', value: '2' },
            ]}
            onChange={(value) => setMp3ChannelCount(Number(value) as Mp3ChannelCount)}
          />
        </div>
      </div>

      <Button size="wide" onClick={() => void exportMp3()} disabled={!recordedBlob || isExporting}>
        <Icon name="download" />
        {isExporting ? `Encoding ${Math.round(exportProgress * 100)}%` : 'Download MP3'}
      </Button>
      {isExporting ? (
        <ProgressBar value={exportProgress} />
      ) : null}
    </Panel>
  )
}

function TranscriptPanel() {
  const { isTranscribing, transcript } = useRecorder()

  return (
    <Panel className={styles.transcriptPanel}>
      <PanelHeader
        eyebrow="Live microphone"
        title="Live transcript"
        meta={isTranscribing ? 'Listening' : transcript ? `${Math.round(transcript.confidence * 100)}%` : null}
      />

      <div className={styles.transcriptBox}>{transcript ? transcript.text : 'No live transcript yet.'}</div>
    </Panel>
  )
}

function QueuePanel() {
  const { clearOfflineQueue, sessionChunks, status } = useRecorder()
  const visibleChunks = useMemo(() => sessionChunks.slice(-5).reverse(), [sessionChunks])

  return (
    <Panel>
      <PanelHeader eyebrow="IndexedDB" title="Offline cache" meta="This session" />

      <div className={styles.chunkList}>
        {sessionChunks.length === 0 ? (
          <EmptyState>No cached chunks</EmptyState>
        ) : (
          visibleChunks.map((chunk) => (
            <div className={styles.chunkRow} key={chunk.id}>
              <code>{chunk.id.slice(0, 8)}</code>
              <span>#{chunk.sequence + 1}</span>
              <span>{formatBytes(chunk.size)}</span>
            </div>
          ))
        )}
      </div>

      <Button className={styles.subtle} size="wide" onClick={() => void clearOfflineQueue()} disabled={sessionChunks.length === 0 || status === 'recording'}>
        <Icon name="clear" />
        Clear Session Cache
      </Button>
    </Panel>
  )
}
