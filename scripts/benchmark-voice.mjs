// On-device voice benchmark: runs the real Shruti Hindi model (onnxruntime-web, WASM, one thread,
// the same runtime the browser uses) over every clip in a folder and reports, honestly:
//   - model load time
//   - per-clip latency and real-time factor (processing time / audio length; below 1 is faster
//     than real time)
//   - word error rate against each clip's reference transcript
//
// Inputs come from scripts/fetch-voice-benchmark.mjs (.voice-bench/). You can also point it at your
// own recordings: a folder of 16 kHz WAV files plus references.json [{ file, reference }].
//
// Usage: node scripts/benchmark-voice.mjs [--clips .voice-bench/clips] [--model .voice-bench/model-int8]
//        [--out docs/voice-benchmark-results.json]
//
// Caveat printed with the results: MUCS clips are Hindi-English lecture speech, not shop talk, and
// this machine is not a phone. Phone numbers must come from a run on the phone.

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

// pnpm keeps dependencies inside the package that declares them, so resolve the runtime and the
// model wrapper from packages/speech-provider (the only package allowed to use them).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(join(root, 'packages/speech-provider/package.json'));
const load = (name) => import(pathToFileURL(req.resolve(name)).href);
const ort = await load('onnxruntime-web');
const { createShruti, decodeWav } = await load('shruti-onnx');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const CLIPS = arg('clips', '.voice-bench/clips');
const MODEL = arg('model', '.voice-bench/model-int8');
const OUT = arg('out', '');

ort.env.wasm.numThreads = 1;

/** Same normaliser on both sides: NFC, lowercase, drop punctuation, single spaces. */
export function normalise(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,!?;:"'()[\]{}।॥\-–—/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word-level Levenshtein distance. */
export function editDistance(ref, hyp) {
  const d = Array.from({ length: ref.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= hyp.length; j++) d[0][j] = j;
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      const sub = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + sub);
    }
  }
  return d[ref.length][hyp.length];
}

// Strip a UTF-8 byte-order mark: Windows tools often write one, and JSON.parse rejects it.
const refs = JSON.parse(
  (await readFile(join(CLIPS, 'references.json'), 'utf8')).replace(/^\uFEFF/, ''),
);
const modelDir = resolve(MODEL).replaceAll('\\', '/') + '/';

const t0 = performance.now();
const asr = await createShruti({
  ort,
  baseUrl: modelDir,
  sessionOptions: { graphOptimizationLevel: 'basic' },
});
const loadMs = performance.now() - t0;

const rows = [];
let errors = 0;
let words = 0;
let audioS = 0;
let procMs = 0;
for (const { file, reference, source } of refs) {
  const buf = await readFile(join(CLIPS, file));
  const samples = decodeWav(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const dur = samples.length / 16000;
  const s = performance.now();
  // Same options as the app: language auto-detected, repeated-phrase loops cut.
  const { text, language } = await asr.transcribe(samples, { loops: 'cut' });
  const ms = performance.now() - s;
  const r = normalise(reference).split(' ').filter(Boolean);
  const h = normalise(text).split(' ').filter(Boolean);
  const e = editDistance(r, h);
  errors += e;
  words += r.length;
  audioS += dur;
  procMs += ms;
  rows.push({
    file,
    source,
    seconds: +dur.toFixed(2),
    ms: Math.round(ms),
    rtf: +(ms / 1000 / dur).toFixed(3),
    wer: +(e / r.length).toFixed(3),
    language,
    reference,
    hypothesis: text,
  });
  console.log(
    `${file}  ${dur.toFixed(1)}s audio  ${Math.round(ms)} ms  WER ${((100 * e) / r.length).toFixed(1)}%`,
  );
}

const summary = {
  model: `udgamlabs/Shruti-ONNX hi, ${/int8/.test(MODEL) ? 'int8 build (onnx-int8)' : '4-bit build (onnx)'}, shruti-onnx 0.2.0, onnxruntime-web WASM, 1 thread, 5-beam, loops cut`,
  machine: `${os.cpus()[0]?.model ?? 'unknown CPU'}, ${os.platform()} ${os.arch()}, Node ${process.version}`,
  date: new Date().toISOString().slice(0, 10),
  clips: rows.length,
  audioSeconds: +audioS.toFixed(1),
  modelLoadMs: Math.round(loadMs),
  meanLatencyMs: Math.round(procMs / rows.length),
  realTimeFactor: +(procMs / 1000 / audioS).toFixed(3),
  corpusWer: +(errors / words).toFixed(3),
  caveat:
    'MUCS 2021 Hindi-English lecture speech, not shop orders; desktop CPU, not a phone. Word error rate uses a simple shared normaliser (NFC, lowercase, punctuation removed).',
};
console.log('\n' + JSON.stringify(summary, null, 2));
if (OUT) {
  await writeFile(OUT, JSON.stringify({ summary, rows }, null, 2) + '\n');
  console.log(`\nwrote ${OUT}`);
}
