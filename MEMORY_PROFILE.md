# Memory profile — live Chrome capture

One-off profile run captured via `chrome-devtools-mcp` against the Vite dev
server (`vite --host 127.0.0.1 --port 5173`). Used a synthetic `getUserMedia`
shim (OscillatorNode → MediaStreamDestination) so the recording path could be
driven without real mic permission, and sampled `performance.memory` at each
phase. Heap snapshots were used to force GC between phases.

## Timeline (used / total JS heap)

| Phase | Used | Total | Notes |
|---|---|---|---|
| Baseline (library view) | 5.4 MB | 6.1 MB | App loaded, no recording |
| Record start | 12.6 MB | 18.9 MB | +7.2 MB to spin up MediaRecorder + flow nodes |
| Recording, t+10s | 13.7 MB | 26.2 MB | 2 chunks captured |
| Recording, t+30s | 11.4 MB | 35.4 MB | minor GC fired during capture |
| Recording, t≈84s (16 chunks, 1.2 MB encoded) | 18.6 MB | 35.4 MB | growth ≈ 7 MB above start |
| Right after Stop | 19.4 MB | 35.4 MB | spike from finalize + audio preview |
| **Post-stop after forced GC** | **9.4 MB** | 10.4 MB | most was uncollected garbage |
| Click Download MP3 | 14.3 MB | 21.0 MB | worker decode/encode kicks off |
| During export (sampled 0–2.5 s) | 14.3 MB (flat) | 21.0 MB | main thread barely budges; heavy lifting is in the worker, invisible to `performance.memory` |
| **Post-export after forced GC** | **9.5 MB** | 10.3 MB | returns to ~stop baseline |

## Findings

- **No leak across record → stop → export.** Forced-GC heap returns to ~9.5 MB
  at both checkpoints — only ~4 MB above the library baseline. That delta is
  mostly the React-flow nodes and the still-mounted `PipelineFlow` tree, not
  retained recording data.
- **Most of the in-recording "growth" is short-lived garbage**, not retained
  state. Used heap swings 11–19 MB while total stays ~35 MB — classic
  uncollected allocations (chunk metadata snapshots, recent-event arrays,
  render output) waiting on a GC, not a leak.
- **`performance.memory` doesn't see Blobs.** 1.2 MB of encoded audio went
  through the chunk pipeline yet barely touched used-heap, because Blob bytes
  live in C++ allocations. For real per-byte tracking you'd need
  `Memory.getProcessMemoryUsage` over CDP, or cross-origin isolation so
  `performance.measureUserAgentSpecificMemory()` becomes available.
- **Worker is invisible from this heap.** The main-thread heap was flat
  (≈ +5 KB over 2.5 s) while export ran. PCM decode + MP3 encode happens in
  `src/workers/mp3Encoder.worker.ts`, which has its own heap. The PCM-budget
  guard from commit `288fd06` is doing its job — no spike on the main thread.

## How to repeat

1. `yarn dev` and open `http://127.0.0.1:5173/` in Chrome (with DevTools
   connected via `chrome-devtools-mcp` or directly).
2. Install the synthetic mic + sampler:
    ```js
    const ac = new AudioContext()
    const osc = ac.createOscillator(); osc.frequency.value = 220
    const dest = ac.createMediaStreamDestination()
    osc.connect(dest); osc.start()
    navigator.mediaDevices.getUserMedia = async () => dest.stream
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: 'audioinput', deviceId: 'default', groupId: 'g', label: 'Synthetic mic', toJSON: () => ({}) },
    ]
    window.__memSamples = []
    window.__memSample = (label) => {
      const m = performance.memory
      const s = { label, t: performance.now(), used: m?.usedJSHeapSize, total: m?.totalJSHeapSize }
      window.__memSamples.push(s); return s
    }
    ```
3. Click **NEW RECORDING → RECORD**, sample at intervals
   (`window.__memSample('t+Ns')`).
4. Click **STOP**, sample, then take a heap snapshot to force GC and sample
   again.
5. Click **DOWNLOAD MP3**, sample during export, take a final heap snapshot,
   sample again.
6. Read `window.__memSamples` for the full timeline.

## Sketch of an automated regression test

Playwright with the same synthetic-mic shim, plus CDP for forced GC:

1. Drive **record → stop → export** with the OscillatorNode mic.
2. `cdp.send('HeapProfiler.collectGarbage')` to force GC.
3. Sample `performance.memory.usedJSHeapSize`.
4. Assert `(after_export - baseline) < ~6 MB` based on the numbers above.
5. Repeat the full cycle 3× and assert no monotonic growth — catches retained
   Blob URLs and stale closures even though `performance.memory` can't see the
   underlying bytes.
