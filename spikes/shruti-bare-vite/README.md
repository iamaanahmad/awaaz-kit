# Shruti spike (Day 1)

Standalone Vite app, not part of the pnpm workspace. Run with npm:

```
npm install
npm run dev
```

1. Fill `public/model-manifest.json` with the Shruti model file URLs (and optional `sha256`).
2. "Download model" streams files into Cache Storage (`awaaz-speech-model-v1`). Reload and use "Load from cache" to confirm persistence.
3. "Record" captures the mic and decodes to mono 16 kHz Float32.

4. After "Load from cache", check the input/output names under "Transcription settings" (prefilled from the session) and pick the output mode (`text`, `ids` or `ctc`). For `ids`/`ctc` add a `vocab.json` entry to the manifest (token array or token-to-id object).
5. "Transcribe last recording" runs one clip. The 30-clip table (10 Hindi, 10 Hinglish, 10 English, reference text only) takes per-row recordings or 30 audio files in table order. No audio is stored.
6. "Check reload from cache" verifies the files survive; also reload the page and press "Load from cache" for a true reload test.
7. "Build summary" prints first/repeat latency, peak JS heap (Chrome only), reload check and WER per group as markdown for `docs/model-benchmark.md` (task 1.3).
