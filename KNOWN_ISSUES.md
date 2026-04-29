# Known Issues

Open follow-up items for the current architecture (single `recording-sessions` IndexedDB, `react-flow` UI, `Result<T, AppError>` core). Resolved items from earlier reviews are not repeated here — most of the original list referenced files that no longer exist.

## IndexedDB

| Area | Files | Issue |
| --- | --- | --- |
<!-- Bootstrap retry — fixed: openDatabase() now resets `databasePromise` to null on rejection so a transient error (blocked, quota, private mode) doesn't poison subsequent calls. -->

| Upgrade handler | `src/lib/db.ts` | The `onupgradeneeded` path drops any legacy stores from earlier versions wholesale. Acceptable for this demo but a real upgrade strategy would migrate prior data instead of nuking it. |
| Large-session memory | `src/lib/db.ts` | `loadSession` and `listChunksForSession` use `getAll`, materializing every chunk row into JS at once. Fine for short takes; long recordings would benefit from a cursor-based read or worker-side range reads. |
| Quota exhaustion | `src/lib/db.ts`, `src/hooks/usePipeline.ts` | There is no detection or user-facing surface for `QuotaExceededError` during `saveChunk`. A long take on a near-full origin will start failing silently with a `storage` error code. |

## Recording lifecycle

| Area | Files | Issue |
| --- | --- | --- |
| Crash recovery boundary | `src/services/mediaRecorderService.ts` | `MediaRecorder` is started with a 5 s timeslice. Audio captured between the last `ondataavailable` boundary and a tab crash never reaches IndexedDB. Lowering `CHUNK_TIMESLICE_MS` tightens the loss window at the cost of more IDB writes. |
| Draft accumulation | `src/lib/db.ts`, `src/components/SessionLibrary/` | Repeated mid-recording crashes produce a draft session per visit. There is no automatic prune of old drafts and no UI affordance other than manual delete. |
| No resume into a draft | `src/hooks/usePipeline.ts` | Opening a draft session is preview-only. There is no "continue recording" button that would append more chunks under the same `sessionId`. |
<!-- Recording duration cap — fixed: usePipeline auto-stops the recorder when `elapsedMs` reaches `MAX_RECORDING_MS` and surfaces a recorderError explaining the cap. -->


## Export

| Area | Files | Issue |
| --- | --- | --- |
| Cancellation / timeout | `src/services/audioExportService.ts`, `src/hooks/usePipeline.ts` | `encodeMp3` has no abort path. A stalled worker leaves `isExporting: true` indefinitely, with no UI for the user to cancel. |
| Codec coverage | `src/workers/mp3Encoder.worker.ts` | Mediabunny decode requires the browser to support the recorded codec. Browsers that capture WebM/Opus but lack WebCodecs decode for it will fail export even though playback works. There is no preflight or graceful fallback. |
<!-- Export size guard — fixed: usePipeline.exportMp3 returns an `invalid-state` AppError before invoking the worker when the take exceeds `MAX_EXPORT_DURATION_MS`. -->


## Transcription

| Area | Files | Issue |
| --- | --- | --- |
| Recovery scope | `src/services/speechRecognitionService.ts` | Only `no-speech` is treated as recoverable. Network blips, `audio-capture`, and `service-not-allowed` end live transcription with no retry. |
| Browser coverage | `src/services/speechRecognitionService.ts` | `SpeechRecognition` is Chromium-only today. The transcription node surfaces `unsupported` immediately on Safari/Firefox. |
| Word timing | `src/services/speechRecognitionService.ts` | Final segments are timestamped from recorder elapsed time, not from the API. Any region timing is approximate. |

## App-level

| Area | Files | Issue |
| --- | --- | --- |
| Object URL lifecycle | `src/hooks/usePipeline.ts` | `pendingBlobUrlRef` is revoked on unmount and on the next take, but the `initialSession`-driven URL created inside the lazy state initializer is only revoked when the next take overwrites it. Worth re-auditing for repeated open/close cycles. |
| Async fire-and-forget | `src/App.tsx`, `src/components/flow/PipelineFlow.tsx`, `src/hooks/usePipeline.ts` | Several `void`-discarded async calls (refresh, delete, finalize, recover) swallow their `Result.error` if it happens after the initial branch. Errors should keep being routed to `loadError` / the error boundary. |
| URL routing fragility | `src/App.tsx` | `?session=<id>` parsing is hand-rolled around `pushState` / `popstate`. Adequate for one parameter; more app state would warrant a tiny router. |
| Test realism | `src/test/*` | Storage, service, hook (`usePipeline`), and URL-state tests run via Vitest with `fake-indexeddb` and a hand-rolled `MediaRecorder` stub. There are still no rendered UI tests for the flow chart or session library — `react-flow` interactions specifically are not exercised. |
