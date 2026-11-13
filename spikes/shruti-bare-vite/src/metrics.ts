import type { ClipGroup } from "./clips";

/** Lowercase, strip punctuation (keeps letters, digits and Devanagari marks), split on whitespace. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word-level edit distance (substitutions + insertions + deletions). */
export function editDistance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export interface WerSample {
  reference: string;
  hypothesis: string;
}

/** Corpus-level WER: total errors / total reference words. Returns null with no reference words. */
export function wer(samples: WerSample[]): number | null {
  let errors = 0;
  let refWords = 0;
  for (const s of samples) {
    const r = words(s.reference);
    errors += editDistance(r, words(s.hypothesis));
    refWords += r.length;
  }
  return refWords === 0 ? null : errors / refWords;
}

export interface ClipResult {
  clipId: string;
  group: ClipGroup;
  reference: string;
  hypothesis: string;
  audioSeconds: number;
  /** Inference time of this run in ms. */
  latencyMs: number;
  /** True when this was the first inference after the session was created. */
  firstInference: boolean;
}

export function werByGroup(results: ClipResult[]): Record<ClipGroup, { wer: number | null; clips: number }> {
  const out = {} as Record<ClipGroup, { wer: number | null; clips: number }>;
  for (const g of ["hindi", "hinglish", "english"] as ClipGroup[]) {
    const rs = results.filter((r) => r.group === g);
    out[g] = { wer: wer(rs), clips: rs.length };
  }
  return out;
}

/** JS heap in MB. Chrome-only `performance.memory`; null elsewhere. WASM memory is not included. */
export function heapMb(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize / 1048576 : null;
}

export class PeakMemory {
  peakMb: number | null = null;
  sample(): void {
    const h = heapMb();
    if (h !== null && (this.peakMb === null || h > this.peakMb)) this.peakMb = h;
  }
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
const ms = (v: number | null) => (v === null ? "n/a" : `${Math.round(v)} ms`);

/** Markdown summary to paste into docs/model-benchmark.md (task 1.3). */
export function summaryMarkdown(args: {
  results: ClipResult[];
  firstInferenceMs: number | null;
  peakHeapMb: number | null;
  cacheReloadOk: boolean | null;
  runtime: string;
  userAgent: string;
}): string {
  const g = werByGroup(args.results);
  const repeats = args.results.filter((r) => !r.firstInference).map((r) => r.latencyMs);
  const rows = (["hindi", "hinglish", "english"] as ClipGroup[])
    .map((k) => `| ${k} | ${g[k].clips} | ${pct(g[k].wer)} |`)
    .join("\n");
  return [
    `Runtime: ${args.runtime}`,
    `User agent: ${args.userAgent}`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| First inference latency | ${ms(args.firstInferenceMs)} |`,
    `| Repeat inference latency (median) | ${ms(median(repeats))} |`,
    `| Peak JS heap | ${args.peakHeapMb === null ? "n/a (browser does not expose it)" : `${args.peakHeapMb.toFixed(0)} MB`} |`,
    `| Reload from cache | ${args.cacheReloadOk === null ? "not checked" : args.cacheReloadOk ? "ok" : "failed"} |`,
    "",
    "| Group | Clips | WER |",
    "| --- | --- | --- |",
    rows,
  ].join("\n");
}
