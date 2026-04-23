# Known Issues

This document captures open follow-up items called out during the review of [PR #1](https://github.com/katspaugh/wavesurfer-record-demo/pull/1), based on [issue comment 4304584021](https://github.com/katspaugh/wavesurfer-record-demo/pull/1#issuecomment-4304584021).

It is intentionally focused on unresolved items. CSS module declaration drift is not listed here because this branch now generates and checks those typings automatically.

## Open follow-up items

| Area | Files | Issue |
| --- | --- | --- |
| IndexedDB bootstrap | `src/lib/chunkDb.ts` | `openDatabase()` keeps a module-level `databasePromise`. If the first open fails, later calls reuse the failed promise instead of retrying. |
| IndexedDB migration | `src/lib/chunkDb.ts` | The `onupgradeneeded` migration path deserves another pass for cursor error handling and explicit behavior from older DB versions. |
| Large-session memory use | `src/lib/chunkDb.ts` | Chunk listing paths read entire result sets into memory, which may become expensive for very long sessions. |
| Fresh-record reset safety | `src/services/sessionRecordingService.ts` | `prepareSessionForFreshRecording()` deletes cached audio before persisting the reset session metadata, so a crash in between can leave storage inconsistent. |
| Reducer URL lifecycle | `src/state/recorderReducer.ts` | Recorded URL replacement should continue to be reviewed for object URL revocation so repeated takes do not leak browser memory. |
| Reducer exhaustiveness | `src/state/recorderReducer.ts` | The reducer has no exhaustiveness guard for newly added action types. |
| Global cache clearing | `src/hooks/useRecorderApp.ts` | `clearOfflineQueue()` clears all chunks when there is no active session, which may wipe unrelated session data. |
| Export cancellation | `src/services/audioExportService.ts`, `src/hooks/useMp3Export.ts` | MP3 export has no timeout or abort path, so a stalled worker can leave the UI stuck in an exporting state. |
| Recording/export limits | `README.md`, `src/lib/audio.ts`, `src/services/audioExportService.ts` | The 4 hour recording limit and 2 hour export limit are intentionally different in code, but they should keep a clear user-facing explanation and failure mode. |
| Transcription recovery | `src/services/speechRecognitionService.ts`, `src/hooks/useLiveTranscription.ts` | Only `no-speech` is treated as recoverable. Network failures still end live transcription without retry logic. |
| Segmented control accessibility | `src/components/ui/SegmentedControl.tsx` | The radiogroup-style control still needs a full ARIA keyboard-interaction review. |
| Async fire-and-forget auditing | `src/App.tsx`, `src/components/RecorderView.tsx`, `src/hooks/useRecorderApp.ts` | `void`-discarded async calls should keep being audited so operational errors are surfaced through reducer state or an error boundary. |
| Test realism | `src/test/App.test.tsx`, `src/test/RecorderView.test.tsx` | The MediaRecorder stub is minimal and some UI interaction tests still use `fireEvent`, so they may miss browser-realistic interaction failures. |
| CI coverage | `.github/workflows/ci.yml` | CI still does not run `yarn lint`. |
