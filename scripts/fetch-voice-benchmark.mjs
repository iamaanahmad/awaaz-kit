// Downloads what the on-device voice benchmark needs into .voice-bench/ (git-ignored):
//   1. The Shruti Hindi model, each file checked against the publisher's SHA-256 from MANIFEST.json.
//      Default: the int8 build the app ships (4 files, ~50 MB) into .voice-bench/model-int8.
//      --variant 4bit: the 4-bit build (~32 MB) into .voice-bench/model, for comparison.
//   2. A small sample of the MUCS 2021 Hindi-English (Hinglish) test set with reference
//      transcripts, via the Hugging Face datasets-server. MUCS is CC-BY-4.0 (the original corpus is
//      CC-BY-SA-4.0). Clips stay on this machine and are never committed (see .gitignore), in line
//      with the rule that the repo holds no identifiable speaker recordings.
//
// Usage: node scripts/fetch-voice-benchmark.mjs [--clips 20] [--variant int8|4bit]

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = '.voice-bench';
const MANIFEST_URL = 'https://huggingface.co/udgamlabs/Shruti-ONNX/resolve/main/MANIFEST.json';
const MODEL_FILES = ['frontend.onnx', 'encoder.onnx', 'decoder.onnx', 'shruti.json'];
const DATASET = 'dianavdavidson/MUCS-Hinglish';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const CLIPS = Number(arg('clips', '20'));
const VARIANT = arg('variant', 'int8');
if (VARIANT !== 'int8' && VARIANT !== '4bit') throw new Error('--variant must be int8 or 4bit');
const FOLDER = VARIANT === 'int8' ? 'onnx-int8' : 'onnx';
const MODEL_BASE = `https://huggingface.co/udgamlabs/Shruti-ONNX/resolve/main/hi/${FOLDER}/`;
const MODEL_DIR = join(OUT, VARIANT === 'int8' ? 'model-int8' : 'model');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const exists = async (p) =>
  stat(p).then(
    () => true,
    () => false,
  );

async function fetchModel() {
  const dir = MODEL_DIR;
  await mkdir(dir, { recursive: true });
  const manifest = await (await fetch(MANIFEST_URL)).json();
  for (const f of MODEL_FILES) {
    const want = manifest[`hi/${FOLDER}/${f}`];
    if (!want) throw new Error(`MANIFEST.json has no entry for hi/${FOLDER}/${f}`);
    const path = join(dir, f);
    if (await exists(path)) {
      const have = sha256(await readFile(path));
      if (have === want.sha256) {
        console.log(`model ${VARIANT} ${f}: cached, sha256 ok`);
        continue;
      }
    }
    const res = await fetch(MODEL_BASE + f);
    if (!res.ok) throw new Error(`download ${f}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== want.sha256) throw new Error(`model ${f}: sha256 mismatch (got ${got})`);
    await writeFile(path, buf);
    console.log(`model ${VARIANT} ${f}: ${(buf.length / 1e6).toFixed(1)} MB, sha256 ok`);
  }
}

async function fetchClips() {
  const dir = join(OUT, 'clips');
  await mkdir(dir, { recursive: true });
  const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DATASET)}&config=default&split=test&offset=0&length=${CLIPS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`datasets-server: HTTP ${res.status}`);
  const { rows } = await res.json();
  const refs = [];
  for (const { row_idx: idx, row } of rows) {
    const src = row.audio?.[0]?.src;
    if (!src) continue;
    const name = `mucs-${String(idx).padStart(3, '0')}.wav`;
    const path = join(dir, name);
    if (!(await exists(path))) {
      const a = await fetch(src);
      if (!a.ok) throw new Error(`clip ${idx}: HTTP ${a.status}`);
      await writeFile(path, Buffer.from(await a.arrayBuffer()));
    }
    refs.push({ file: name, reference: row.transcript, source: `${DATASET} test #${idx}` });
  }
  await writeFile(join(dir, 'references.json'), JSON.stringify(refs, null, 2));
  console.log(`clips: ${refs.length} with reference transcripts in ${dir}`);
}

await fetchModel();
await fetchClips();
