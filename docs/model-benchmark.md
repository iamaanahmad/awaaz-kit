# Speech Model Benchmark and Go/No-Go Decision

Status: PROVISIONAL. No manual spike run has been recorded yet. Every result below is marked "pending manual run". No measurement in this document is real until someone fills it in from the spike harness output.

Related requirements: 5.2, 5.11. Gate definition: `design.md`, "Speech spike" section.

## 1. Provisional decision

- Shipping default provider id: `scripted` (typed input plus labelled "Sample" utterance chips). Task 3.6 should use `scripted` as the default.
- The real STT adapter (Shruti) is built behind `SpeechToTextProvider` and enabled as the default only after the manual spike results are recorded here and meet the criteria in section 5.
- Fallback chain: `shruti`, then `whisper-wasm` (whisper.cpp WASM), then typed input and scripted sample clips.
- Product claim stays honest: voice is local and optional, typed input is first-class, and sample chips are always labelled "Sample".

This decision is revisited once section 6 is filled in. If Shruti passes, change the default to `shruti` in `packages/speech-provider/src/registry.ts` and update section 1.

## 2. Protocol

1. Start the harness (section 4) on each device and browser in the matrix.
2. Fill `public/model-manifest.json` with model file URLs (and optional `sha256`), then press "Download model". Note whether the WASM or WebGPU execution path is used.
3. Reload the page and press "Load from cache" to confirm the model survives a reload. Also run "Check reload from cache".
4. Transcribe the 30-clip list: 10 Hindi, 10 Hinglish, 10 English retail clips. Use consented, non-identifiable recordings. Only reference text lives in the harness; no audio is committed.
5. For the latency check, transcribe a 5 second clip: record first-inference latency, then repeat-inference latency (at least 3 repeats).
6. Record peak JS heap (Chrome only) from the summary.
7. Judge editable-quality: for each sample order, can a user correct the transcript in under a minute? Record yes or no per group.
8. Press "Build summary" and paste its output into section 6.

## 3. Device and browser matrix

| Device                         | OS      | Browser            | Execution path | Run status         |
| ------------------------------ | ------- | ------------------ | -------------- | ------------------ |
| Desktop (development machine)  | Pending | Chrome             | Pending        | pending manual run |
| Target mid-range Android phone | Pending | Chrome for Android | Pending        | pending manual run |

The target Android phone result is the one that drives the gate. Record exact device model, OS version and browser version when the run is done.

## 4. Spike harness usage

Location: `spikes/shruti-bare-vite/` (standalone Vite app, outside the pnpm workspace packages; use npm).

```
cd spikes/shruti-bare-vite
npm install
npm run dev
```

Steps in the UI, as documented in the harness `README.md`:

1. "Download model" streams files into Cache Storage (`awaaz-speech-model-v1`).
2. "Load from cache" after a page reload confirms persistence.
3. "Record" captures the mic and decodes to mono 16 kHz Float32.
4. Check input and output names under "Transcription settings" and pick the output mode (`text`, `ids` or `ctc`). For `ids` or `ctc`, add a `vocab.json` entry to the manifest.
5. "Transcribe last recording" runs one clip. The 30-clip table accepts per-row recordings or 30 audio files in table order.
6. "Build summary" prints first and repeat latency, peak JS heap, reload check and WER per group as markdown.

To test on Android, serve the dev server over the local network (or use a tunnel) on a secure origin so microphone access works.

## 5. Decision criteria

From the design go/no-go gate:

- Go with Shruti if all hold on the target Android phone: a 5 second clip transcribes in 10 seconds or less, the model loads from cache after reload, and transcripts are editable-quality (correctable in under a minute for the sample orders).
- Otherwise switch the default to `whisper-wasm` (tiny model, about 74 MB, CPU heavy) if it meets the same latency bar.
- Otherwise ship typed input plus `ScriptedProvider` demo clips as the primary path, and keep the Shruti adapter as an opt-in "experimental" provider.

## 6. Results (pending manual run)

### 6.1 Latency, memory and cache

| Provider     | Device                | First inference (5 s clip) | Repeat inference (median) | Peak JS heap       | Reload from cache  |
| ------------ | --------------------- | -------------------------- | ------------------------- | ------------------ | ------------------ |
| shruti       | Desktop Chrome        | pending manual run         | pending manual run        | pending manual run | pending manual run |
| shruti       | Target Android Chrome | pending manual run         | pending manual run        | pending manual run | pending manual run |
| whisper-wasm | Desktop Chrome        | pending manual run         | pending manual run        | pending manual run | pending manual run |
| whisper-wasm | Target Android Chrome | pending manual run         | pending manual run        | pending manual run | pending manual run |

### 6.2 Word error rate per group

| Provider     | Device                | Hindi (10 clips)   | Hinglish (10 clips) | English (10 clips) | Editable-quality (yes/no) |
| ------------ | --------------------- | ------------------ | ------------------- | ------------------ | ------------------------- |
| shruti       | Desktop Chrome        | pending manual run | pending manual run  | pending manual run | pending manual run        |
| shruti       | Target Android Chrome | pending manual run | pending manual run  | pending manual run | pending manual run        |
| whisper-wasm | Desktop Chrome        | pending manual run | pending manual run  | pending manual run | pending manual run        |
| whisper-wasm | Target Android Chrome | pending manual run | pending manual run  | pending manual run | pending manual run        |

Whisper WASM is only benchmarked if Shruti fails the gate.

## 7. Final decision (pending manual run)

| Item                      | Value                                        |
| ------------------------- | -------------------------------------------- |
| Gate outcome              | pending manual run                           |
| Final default provider id | pending manual run (provisional: `scripted`) |
| Decided on                | pending manual run                           |
| Decided by                | pending manual run                           |
