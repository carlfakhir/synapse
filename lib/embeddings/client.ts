// Thin main-thread client around the embeddings web worker.
// Exposes a promise-based embed() call and a ready-state observable.

export type EmbeddingsStatus =
  | { kind: "idle" }
  | { kind: "loading"; stage: string; pct: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type Pending = {
  resolve: (v: Float32Array) => void;
  reject: (err: Error) => void;
};

export class EmbeddingsClient {
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 0;
  private status: EmbeddingsStatus = { kind: "idle" };
  private listeners = new Set<(s: EmbeddingsStatus) => void>();

  start(): void {
    if (this.worker || typeof window === "undefined") return;
    this.setStatus({ kind: "loading", stage: "init", pct: 0 });
    this.worker = new Worker(
      new URL("../../workers/embeddings.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (e) => this.onMessage(e.data);
    this.worker.onerror = (e) => {
      this.setStatus({ kind: "error", message: e.message });
    };
  }

  private onMessage(msg: {
    type: string;
    id?: string;
    vector?: number[];
    stage?: string;
    pct?: number;
    message?: string;
  }) {
    if (msg.type === "ready") {
      this.setStatus({ kind: "ready" });
      return;
    }
    if (msg.type === "progress") {
      this.setStatus({
        kind: "loading",
        stage: msg.stage ?? "loading",
        pct: msg.pct ?? 0,
      });
      return;
    }
    if (msg.type === "result" && msg.id && msg.vector) {
      const p = this.pending.get(msg.id);
      if (p) {
        p.resolve(new Float32Array(msg.vector));
        this.pending.delete(msg.id);
      }
    }
    if (msg.type === "error") {
      const err = new Error(msg.message ?? "embedding worker error");
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          p.reject(err);
          this.pending.delete(msg.id);
          return;
        }
      }
      this.setStatus({ kind: "error", message: err.message });
    }
  }

  embed(text: string): Promise<Float32Array> {
    if (!this.worker) this.start();
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: "embed", id, text });
    });
  }

  onStatus(listener: (s: EmbeddingsStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(s: EmbeddingsStatus) {
    this.status = s;
    for (const l of this.listeners) l(s);
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
