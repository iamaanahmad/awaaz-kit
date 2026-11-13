export const TARGET_RATE = 16000;

export interface Recorder {
  stop(): Promise<Float32Array>;
}

/** Starts recording from the microphone. stop() resolves mono 16 kHz Float32 samples. */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size > 0 && parts.push(e.data);
  rec.start();
  return {
    stop: () =>
      new Promise<Float32Array>((resolve, reject) => {
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          try {
            const blob = new Blob(parts, { type: rec.mimeType });
            resolve(await decodeToMono16k(await blob.arrayBuffer()));
          } catch (e) {
            reject(e);
          }
        };
        rec.stop();
      }),
  };
}

/** Decodes encoded audio and resamples to mono 16 kHz Float32. */
export async function decodeToMono16k(encoded: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(encoded);
    const frames = Math.ceil(decoded.duration * TARGET_RATE);
    const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded; // multi-channel input is down-mixed to mono by the 1-channel destination
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    await ctx.close();
  }
}
