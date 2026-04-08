// Web Worker: hosts transformers.js + all-MiniLM-L6-v2 off the main thread.
// Loads ~25MB of weights on first use, cached thereafter by the browser.
// The main thread posts { id, text } jobs and receives { id, vector } results.

import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Allow the browser to fetch + cache weights from the CDN.
env.allowLocalModels = false;
env.allowRemoteModels = true;

type Job = { type: "embed"; id: string; text: string };
type Ready = { type: "ready" };
type Progress = { type: "progress"; stage: string; pct: number };
type Result = { type: "result"; id: string; vector: number[] };
type Err = { type: "error"; id?: string; message: string };
export type WorkerOutbound = Ready | Progress | Result | Err;

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (loading) return loading;
  loading = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    progress_callback: (evt: { status: string; progress?: number }) => {
      post({
        type: "progress",
        stage: evt.status,
        pct: Math.round((evt.progress ?? 0) * 100),
      });
    },
  }).then((p) => {
    extractor = p;
    post({ type: "ready" });
    return p;
  });
  return loading;
}

function post(msg: WorkerOutbound) {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = async (event: MessageEvent<Job>) => {
  const job = event.data;
  if (job.type !== "embed") return;
  try {
    const model = await getExtractor();
    const output = await model(job.text, { pooling: "mean", normalize: true });
    // Tensor -> plain array so it can be cloned across the worker boundary.
    const vector = Array.from(output.data as Float32Array);
    post({ type: "result", id: job.id, vector });
  } catch (err) {
    post({
      type: "error",
      id: job.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

// Kick off the model load immediately so the first embed is fast-ish.
void getExtractor();
