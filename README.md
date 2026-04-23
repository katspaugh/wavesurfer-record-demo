# wavesurfer.js Record Plugin Demo

React demo for the wavesurfer.js Record plugin with browser audio recording, MP3 export, live speech-to-text transcription, and offline chunk persistence.

Live demo: https://wavesurfer-record.pages.dev

## Video demo

https://github.com/user-attachments/assets/5afb48ab-0fac-48ca-ac63-5d7bd95087a9

## Code walkthrough

https://github.com/user-attachments/assets/cfb5be98-b2de-4a67-9caf-a214801cd29d


## Setup

```sh
make install
make css-types
make run
```

The dev server runs at `http://127.0.0.1:5173`.

Production build:

```sh
make build
```

If you edit `*.module.css`, run `make css-types` to refresh the committed declaration files. `make typecheck` and `make build` fail when those generated typings drift.

## Architecture

For a code-oriented overview of the runtime flow, module boundaries, storage, and tooling, see [ARCHITECTURE.md](./ARCHITECTURE.md).

- `wavesurfer.js` + Record plugin renders the live microphone waveform and owns recording state, including pause, resume, finish, and progress events.
- The app opens on a recording session library. Users can start a new session or reopen an existing session; the recorder view is shown only after a session is selected.
- Active sessions are reflected in the URL as `?session=<session-id>`, so refreshing or sharing the same browser URL can reopen a persisted local session.
- Pressing `Finish` finalizes the active session. The finalized audio remains available for playback and MP3 export; another capture starts as a new session rather than overwriting or appending to the finalized take.
- The UI exposes microphone processing constraints before recording starts: echo cancellation, noise filtering/noise suppression, and auto gain control. They are enabled by default and passed into `startRecording()`.
- `record-data-available` is enabled with a 10 second `mediaRecorderTimeslice`; each blob chunk is stored in IndexedDB with an id, session id, sequence number, timestamp, MIME type, and size while the take is in progress.
- The session library summary shows global cache totals. Inside the recorder, the Offline cache widget is scoped to the active session and clearing it removes only that session's cached chunks.
- MP3 export decodes the final browser recording with `AudioContext`, then transfers PCM channel buffers to a Web Worker that uses `wasm-media-encoders` for MP3 encoding. Encoding progress is streamed back to the UI. Export is capped at 2 hours to keep decoded PCM within a safe memory budget.
- When a take is finalized, the completed session blob becomes the durable local artifact and the temporary per-session chunk cache is released to avoid duplicate storage.
- Live transcription starts with recording and uses the browser's `SpeechRecognition` / `webkitSpeechRecognition` API. Interim results update the transcript display; finalized segments are appended, persisted on the active session, and drawn as timed regions over the waveform.

## Assumptions

- The app targets modern Chromium, Safari, and Firefox versions with `MediaRecorder`, IndexedDB, Web Workers, and Web Audio support.
- Recording uses the browser-supported compressed capture MIME type, usually `audio/webm;codecs=opus`. MP3 is produced during export.
- Browser support for `echoCancellation`, `noiseSuppression`, and `autoGainControl` is implementation-dependent; unsupported constraints may be ignored by the user agent.
- The 4 hour duration limit is enforced from the Record plugin progress event.

## Limitations

- MP3 encoding is intentionally moved off the main thread, but `AudioContext.decodeAudioData` still needs the completed recording blob before worker encoding can begin. MP3 export is capped at 2 hours to keep the decoded PCM buffer within a safe memory budget; longer takes must be trimmed first. A production system should use streaming/server-side transcoding or a WebCodecs/AudioEncoder pipeline where available.
- Offline support stores in-progress chunks locally and displays the queue. It does not yet include a background sync uploader or reassembly UI for partially completed sessions.
- Live transcription depends on `SpeechRecognition`, which is only present in Chromium-family browsers today. Safari and Firefox will report the feature as unavailable. Region timing is estimated from recorder elapsed time because the browser API does not expose word-level timestamps. A real service integration would add upload retry policy, authentication, transcript status polling, and precise word timing on top.
- Browser microphone permissions and supported recording MIME types vary by browser.
