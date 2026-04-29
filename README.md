# Recorder pipeline

A self-documenting browser audio recorder. The UI is a [`react-flow`](https://reactflow.dev/) graph whose nodes are the actual stages of the pipeline — getUserMedia, MediaRecorder, an IndexedDB chunk queue, a Mediabunny → MP3 encoder, and live speech-to-text — each rendering its own controls and live state.

Live demo: https://wavesurfer-record.pages.dev

<img width="1445" height="1101" alt="585241656-0f9577fc-c8d8-4669-ac67-178801dd4bdb" src="https://github.com/user-attachments/assets/d02a5416-3108-4e15-b2b2-b65a29d23c0f" />

## Architecture walkthrough

https://github.com/user-attachments/assets/91ca5f66-4943-4db8-8c15-73ce87b88037


## Setup

```sh
make install
make run
```

The dev server runs at `http://127.0.0.1:5173`.

Production build:

```sh
make build
```

If you edit `*.module.css`, run `make css-types` to refresh the committed declaration files. `make typecheck` and `make build` fail when those generated typings drift.

## Architecture

For a code-oriented overview of the data flow, storage model, and module boundaries, see [ARCHITECTURE.md](./ARCHITECTURE.md).

State is split across four reducer-driven slice hooks (`useMicDevices`, `useRecorder`, `useTranscription`, `useMp3Export`) that `usePipeline` composes into the flat `state` / `actions` shape the flow nodes consume.

## What the flow chart shows

The app opens on a session library (`?session=<id>` deep links to a saved take, `?session=new` to a fresh recording). Inside the recorder view, five nodes render the pipeline:

1. **Microphone — getUserMedia.** Device picker, processing toggles (`echoCancellation`, `noiseSuppression`, `autoGainControl`), inline error from `getUserMedia`.
2. **MediaRecorder timeline.** Record / pause / resume / stop, animated elapsed-time bar, MIME type readout.
3. **IndexedDB chunk queue.** Live FIFO of every `ondataavailable` event. Chunks are tagged with the active `sessionId` and persisted as the canonical bytes for the take — they are never cleared on export.
4. **Mediabunny → MP3.** Bitrate / channels, "Download MP3", and a plain `<audio controls>` preview of the assembled blob. Encoding runs in a Web Worker.
5. **Live speech-to-text.** Browser `SpeechRecognition`, running in parallel with the recorder. Final segments persist on the session.

Edges animate while data is flowing: mic → recorder while live, recorder → queue while chunks are being persisted, queue → export while encoding, recorder → transcription while listening.

## Result-based core

Every async or IO surface returns `Result<T, AppError>` from `src/lib/result.ts` rather than throwing. `AppError` carries a structured `code` (`unsupported`, `permission-denied`, `in-use`, `storage`, `encoding`, `speech`, `unknown`, …) so callers branch on `result.ok` and `result.error.code` instead of inspecting exception messages.

## Storage and crash recovery

A single IndexedDB database `recording-sessions` holds two stores:

- `sessions` — metadata only (`id`, `title`, `durationMs`, `size`, `mimeType`, `transcript[]`, `finalized`).
- `chunks` — blob rows indexed by `sessionId`, written one per `ondataavailable` (5 s timeslice).

Loading a session reads its metadata and assembles a virtual `Blob` from the chunks via reference-concat. The same blob feeds the `<audio>` preview and the MP3 worker.

On every app mount `reconcileSessions()` promotes orphan chunks (no matching session row) into a `Recovered recording — …` draft and deletes empty failed-start drafts. A tab crash mid-recording shows up as a draft on next visit, limited only by the timeslice boundary — anything captured between the last 5 s emission and the crash is lost with the in-memory `MediaRecorder` buffer.

## Assumptions

- Targets modern Chromium, Safari, and Firefox versions with `MediaRecorder`, IndexedDB, Web Workers, and enough media codec support for Mediabunny / WebCodecs to read the recorded format.
- Recording uses the browser-supported compressed capture MIME type (usually `audio/webm;codecs=opus`). MP3 is produced only at export time.
- Browser support for `echoCancellation`, `noiseSuppression`, and `autoGainControl` is implementation-dependent; unsupported constraints may be ignored by the user agent.

## Limitations

- MP3 export is intentionally client-side. Mediabunny parses the container in the worker, but compressed audio decode still depends on browser/WebCodecs support for the recorded codec. Browsers that cannot decode the recorded format through that path will fail export even if playback works elsewhere in the app.
- The Mediabunny path is not a production transcoding backend. A real system would stream chunks to a server and transcode there — see the closing notes in `ARCHITECTURE.md`.
- The 5 s `MediaRecorder` timeslice means crash recovery loses up to 5 s of trailing audio. Lower the value in `mediaRecorderService.ts` to tighten that window at the cost of more IndexedDB writes.
- Live transcription depends on `SpeechRecognition`, only present in Chromium-family browsers today. Safari and Firefox report the feature as unavailable. Region timing is estimated from recorder elapsed time because the API does not expose word-level timestamps.
- Browser microphone permissions and supported recording MIME types vary by browser.
