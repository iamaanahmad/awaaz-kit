import * as ort from "onnxruntime-web";
import { startRecording, TARGET_RATE, type Recorder } from "./audio";
import * as models from "./modelCache";
import { decodeToMono16k } from "./audio";
import { CLIPS, type Clip } from "./clips";
import { PeakMemory, summaryMarkdown, type ClipResult } from "./metrics";
import { defaultConfig, parseVocab, transcribe, type OutputMode, type TranscribeConfig } from "./transcribe";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $("log");
const log = (m: string) => {
  logEl.textContent += `${new Date().toISOString().slice(11, 19)} ${m}\n`;
};

let manifest: models.Manifest | null = null;
let session: ort.InferenceSession | null = null;
let lastAudio: Float32Array | null = null;
let recorder: Recorder | null = null;

function setStatus(s: models.ModelStatus) {
  $("model-status").textContent = s;
}

async function getManifest() {
  manifest = await models.fetchManifest($<HTMLInputElement>("manifest-url").value);
  return manifest;
}

async function refreshStatus() {
  try {
    setStatus(await models.status(await getManifest()));
  } catch (e) {
    setStatus("failed");
    log(`status: ${(e as Error).message}`);
  }
}

$("download-btn").addEventListener("click", async () => {
  const bar = $<HTMLProgressElement>("download-progress");
  try {
    const m = await getManifest();
    setStatus("downloading");
    bar.hidden = false;
    await models.download(m, (f) => (bar.value = f));
    log("download complete");
  } catch (e) {
    setStatus("failed");
    log(`download: ${(e as Error).message}`);
    return;
  } finally {
    bar.hidden = true;
  }
  await refreshStatus();
});

$("load-btn").addEventListener("click", async () => {
  try {
    const m = manifest ?? (await getManifest());
    const file = m.files.find((f) => f.name.endsWith(".onnx"));
    if (!file) throw new Error("No .onnx file in manifest");
    const t0 = performance.now();
    const bytes = await models.readCached(file);
    // Prefer WebGPU when present, otherwise WASM.
    const providers = "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
    session = await ort.InferenceSession.create(bytes, { executionProviders: providers });
    $("runtime-info").textContent =
      `inputs: ${session.inputNames.join(", ")} | outputs: ${session.outputNames.join(", ")} | providers tried: ${providers.join(">")}`;
    log(`model loaded from cache in ${Math.round(performance.now() - t0)} ms`);
    onSessionReady(session);
  } catch (e) {
    log(`load: ${(e as Error).message}`);
  }
});

$("remove-btn").addEventListener("click", async () => {
  await models.remove();
  session = null;
  log("cache removed");
  await refreshStatus();
});

$("record-btn").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("record-btn");
  const st = $("record-status");
  try {
    if (!recorder) {
      recorder = await startRecording();
      btn.textContent = "Stop";
      st.textContent = "recording";
      return;
    }
    const r = recorder;
    recorder = null;
    btn.textContent = "Record";
    st.textContent = "decoding";
    lastAudio = await r.stop();
    st.textContent = "idle";
    const secs = (lastAudio.length / TARGET_RATE).toFixed(2);
    $("audio-info").textContent = `Float32 mono ${TARGET_RATE} Hz, ${lastAudio.length} samples (${secs} s)`;
    log(`recorded ${secs} s${session ? "" : " (model not loaded)"}`);
  } catch (e) {
    recorder = null;
    btn.textContent = "Record";
    st.textContent = "error";
    log(`record: ${(e as Error).message}`);
  }
});

// ---- Task 1.2: transcription and metrics ----

let cfg: TranscribeConfig | null = null;
let vocabLoaded: string[] | null = null;
let inferenceCount = 0; // 0 means the next run is the first inference for this session
let firstInferenceMs: number | null = null;
let cacheReloadOk: boolean | null = null;
let runtimeInfo = "not loaded";
const results = new Map<string, ClipResult>();
const peak = new PeakMemory();

function readCfg(): TranscribeConfig {
  if (!session) throw new Error("Load the model first");
  return {
    inputName: $<HTMLInputElement>("cfg-input").value,
    lengthInputName: $<HTMLInputElement>("cfg-length").value,
    outputName: $<HTMLInputElement>("cfg-output").value,
    outputMode: $<HTMLSelectElement>("cfg-mode").value as OutputMode,
    vocab: vocabLoaded,
    blankId: Number($<HTMLInputElement>("cfg-blank").value),
    joiner: $<HTMLInputElement>("cfg-joiner").value,
  };
}

function initCfgFields(s: ort.InferenceSession) {
  cfg = defaultConfig(s);
  $<HTMLInputElement>("cfg-input").value = cfg.inputName;
  $<HTMLInputElement>("cfg-length").value = cfg.lengthInputName;
  $<HTMLInputElement>("cfg-output").value = cfg.outputName;
}

async function loadVocab() {
  vocabLoaded = null;
  const m = manifest;
  const file = m?.files.find((f) => f.name === "vocab.json");
  if (!file) {
    $("vocab-info").textContent = "none (put a vocab.json entry in the manifest if needed)";
    return;
  }
  vocabLoaded = parseVocab(JSON.parse(new TextDecoder().decode(await models.readCached(file))));
  $("vocab-info").textContent = `${vocabLoaded.length} tokens`;
}

/** Runs one inference and records timing and memory. */
async function runOne(audio: Float32Array): Promise<{ text: string; ms: number; first: boolean }> {
  const s = session;
  if (!s) throw new Error("Load the model first");
  const c = readCfg();
  const first = inferenceCount === 0;
  peak.sample();
  const t0 = performance.now();
  const text = await transcribe(s, audio, c);
  const ms = performance.now() - t0;
  peak.sample();
  inferenceCount++;
  if (first) firstInferenceMs = ms;
  return { text, ms, first };
}

/** Called by the load handler once a new session exists. */
function onSessionReady(s: ort.InferenceSession) {
  inferenceCount = 0;
  runtimeInfo = $("runtime-info").textContent ?? "";
  initCfgFields(s);
  void loadVocab().catch((e) => log(`vocab: ${(e as Error).message}`));
}

$("transcribe-btn").addEventListener("click", async () => {
  try {
    if (!lastAudio) throw new Error("Record something first");
    const r = await runOne(lastAudio);
    $("transcript").textContent = r.text;
    $("last-latency").textContent = `${Math.round(r.ms)} ms${r.first ? " (first inference)" : ""}`;
    log(`transcribed in ${Math.round(r.ms)} ms`);
  } catch (e) {
    log(`transcribe: ${(e as Error).message}`);
  }
});

function renderTable() {
  const body = document.querySelector<HTMLTableSectionElement>("#clip-table tbody")!;
  body.textContent = "";
  CLIPS.forEach((clip, i) => {
    const tr = document.createElement("tr");
    const res = results.get(clip.id);
    const cells = [String(i + 1), clip.group, clip.reference, res?.hypothesis ?? "", res ? String(Math.round(res.latencyMs)) : ""];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    const td = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Record";
    btn.setAttribute("aria-label", `Record clip ${i + 1}`);
    btn.addEventListener("click", () => void recordClip(clip, btn));
    td.appendChild(btn);
    tr.appendChild(td);
    body.appendChild(tr);
  });
}

let clipRecorder: Recorder | null = null;

async function recordClip(clip: Clip, btn: HTMLButtonElement) {
  try {
    if (!clipRecorder) {
      clipRecorder = await startRecording();
      btn.textContent = "Stop";
      return;
    }
    const r = clipRecorder;
    clipRecorder = null;
    btn.textContent = "Working";
    const audio = await r.stop();
    await processClip(clip, audio);
  } catch (e) {
    clipRecorder = null;
    log(`clip ${clip.id}: ${(e as Error).message}`);
  }
  renderTable();
}

async function processClip(clip: Clip, audio: Float32Array) {
  const { text, ms, first } = await runOne(audio);
  results.set(clip.id, {
    clipId: clip.id,
    group: clip.group,
    reference: clip.reference,
    hypothesis: text,
    audioSeconds: audio.length / TARGET_RATE,
    latencyMs: ms,
    firstInference: first,
  });
}

$("run-files-btn").addEventListener("click", async () => {
  const files = [...($<HTMLInputElement>("clip-files").files ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  if (files.length === 0) return log("choose audio files first");
  if (files.length !== CLIPS.length) log(`warning: ${files.length} files for ${CLIPS.length} clips`);
  for (const [i, f] of files.slice(0, CLIPS.length).entries()) {
    try {
      await processClip(CLIPS[i], await decodeToMono16k(await f.arrayBuffer()));
      log(`clip ${i + 1}/${CLIPS.length} done`);
    } catch (e) {
      log(`clip ${CLIPS[i].id}: ${(e as Error).message}`);
    }
    renderTable();
  }
});

/** Closes the session, re-reads the model from Cache Storage and re-creates the session. */
$("reload-check-btn").addEventListener("click", async () => {
  try {
    const m = manifest ?? (await getManifest());
    cacheReloadOk = (await models.status(m)) === "ready";
    if (cacheReloadOk) {
      const file = m.files.find((f) => f.name.endsWith(".onnx"));
      if (!file) throw new Error("No .onnx file in manifest");
      const t0 = performance.now();
      const probe = await ort.InferenceSession.create(await models.readCached(file), { executionProviders: ["wasm"] });
      await probe.release();
      log(`reload from cache ok (${Math.round(performance.now() - t0)} ms). For a true reload test, reload the page and press "Load from cache".`);
    } else {
      log("reload from cache failed: files missing");
    }
  } catch (e) {
    cacheReloadOk = false;
    log(`reload check: ${(e as Error).message}`);
  }
});

$("summary-btn").addEventListener("click", () => {
  $("summary").textContent = summaryMarkdown({
    results: CLIPS.map((c) => results.get(c.id)).filter((r): r is ClipResult => !!r),
    firstInferenceMs,
    peakHeapMb: peak.peakMb,
    cacheReloadOk,
    runtime: runtimeInfo,
    userAgent: navigator.userAgent,
  });
});

renderTable();
void refreshStatus();
