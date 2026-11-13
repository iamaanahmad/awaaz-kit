import * as ort from "onnxruntime-web";

/**
 * The exact Shruti I/O contract is not confirmed yet, so input/output handling is configurable
 * from the page. Adjust after inspecting `session.inputNames` / `outputNames` (shown on the page).
 *
 * output modes:
 *  - "text":   output tensor is a string tensor; strings are joined
 *  - "ids":    output tensor is token ids; mapped through vocab (array of tokens)
 *  - "ctc":    output is float logits [1, T, V]; greedy argmax, collapse repeats, drop blank
 */
export type OutputMode = "text" | "ids" | "ctc";

export interface TranscribeConfig {
  inputName: string;
  /** Optional second input carrying the sample count as int64 (e.g. "length"). Empty to skip. */
  lengthInputName: string;
  outputName: string;
  outputMode: OutputMode;
  /** Token list indexed by id. Required for "ids" and "ctc". */
  vocab: string[] | null;
  blankId: number;
  /** Characters that join tokens: "" for char vocab; " " for word vocab. */
  joiner: string;
}

export function defaultConfig(session: ort.InferenceSession): TranscribeConfig {
  return {
    inputName: session.inputNames[0] ?? "",
    lengthInputName: session.inputNames[1] ?? "",
    outputName: session.outputNames[0] ?? "",
    outputMode: "text",
    vocab: null,
    blankId: 0,
    joiner: "",
  };
}

export function parseVocab(json: unknown): string[] {
  if (Array.isArray(json)) return json.map(String);
  if (json && typeof json === "object") {
    const out: string[] = [];
    for (const [tok, id] of Object.entries(json as Record<string, unknown>)) {
      if (typeof id === "number") out[id] = tok;
    }
    return out;
  }
  throw new Error("vocab must be an array or a token->id object");
}

/** Greedy CTC decode over row-major [T, V] logits. */
export function ctcGreedy(data: ArrayLike<number>, steps: number, vocabSize: number, blankId: number): number[] {
  const ids: number[] = [];
  let prev = -1;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestV = -Infinity;
    for (let v = 0; v < vocabSize; v++) {
      const x = data[t * vocabSize + v];
      if (x > bestV) {
        bestV = x;
        best = v;
      }
    }
    if (best !== prev && best !== blankId) ids.push(best);
    prev = best;
  }
  return ids;
}

function idsToText(ids: ArrayLike<number | bigint>, cfg: TranscribeConfig): string {
  if (!cfg.vocab) throw new Error("vocab is required for this output mode");
  const toks: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = Number(ids[i]);
    if (id === cfg.blankId) continue;
    const t = cfg.vocab[id];
    if (t !== undefined) toks.push(t);
  }
  return toks.join(cfg.joiner).replace(/▁/g, " ").replace(/\s+/g, " ").trim();
}

export async function transcribe(
  session: ort.InferenceSession,
  audio: Float32Array,
  cfg: TranscribeConfig,
): Promise<string> {
  const feeds: Record<string, ort.Tensor> = {
    [cfg.inputName]: new ort.Tensor("float32", audio, [1, audio.length]),
  };
  if (cfg.lengthInputName) {
    feeds[cfg.lengthInputName] = new ort.Tensor("int64", BigInt64Array.from([BigInt(audio.length)]), [1]);
  }
  const out = await session.run(feeds);
  const t = out[cfg.outputName];
  if (!t) throw new Error(`Output "${cfg.outputName}" not returned (got ${Object.keys(out).join(", ")})`);

  if (cfg.outputMode === "text") return (t.data as unknown as string[]).join(" ").trim();
  if (cfg.outputMode === "ids") return idsToText(t.data as ArrayLike<number | bigint>, cfg);

  const dims = t.dims;
  if (dims.length !== 3) throw new Error(`CTC mode expects [1,T,V] logits, got [${dims.join(",")}]`);
  const ids = ctcGreedy(t.data as Float32Array, dims[1], dims[2], cfg.blankId);
  return idsToText(ids, cfg);
}
