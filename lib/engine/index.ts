// The BrainEngine — composes similarity, activation, strength, and decay
// into a single focus() call that returns ranked associative neighbors.
//
// This file is the public API of the engine. The UI depends only on this.

import type {
  Note,
  NoteId,
  NoteState,
  Edge,
  EngineConfig,
  RankedNeighbor,
} from "./types";
import { DEFAULT_CONFIG } from "./types";
import { cosine } from "./similarity";
import { spread, type AdjacencyMap } from "./activation";
import { computeAllStrengths } from "./strength";
import { decayedWeight, reinforceEdges, type EdgeDecayState } from "./decay";

export type { Note, NoteId, NoteState, RankedNeighbor, EngineConfig } from "./types";
export { DEFAULT_CONFIG } from "./types";

export interface BrainEngineSnapshot {
  states: Array<[NoteId, NoteState]>;
  edgeDecay: Array<[string, number]>;
}

export class BrainEngine {
  private notes = new Map<NoteId, Note>();
  private states = new Map<NoteId, NoteState>();
  private edges: AdjacencyMap = new Map();
  private edgeDecay: EdgeDecayState = { lastTraversed: new Map() };
  private config: EngineConfig;

  constructor(config: EngineConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Load notes into the engine. Caller is responsible for having already
   * computed embeddings (via the embeddings worker). This method is pure
   * data ingestion — no side effects beyond internal state.
   */
  ingest(notes: Note[]): void {
    for (const note of notes) {
      this.notes.set(note.id, note);
      if (!this.states.has(note.id)) {
        this.states.set(note.id, {
          id: note.id,
          lastVisited: 0,
          visitCount: 0,
          pinned: false,
          activation: 0,
        });
      }
    }
    this.rebuildEdges();
  }

  /**
   * Build adjacency from wiki links + semantic similarity above threshold.
   * O(n^2) over notes — acceptable for vaults up to a few thousand notes;
   * re-run only on ingest or config change.
   */
  private rebuildEdges(): void {
    this.edges.clear();
    const notes = [...this.notes.values()];

    for (const note of notes) {
      const edges: Edge[] = [];

      // Wiki edges: explicit, weight 1.0, never decay.
      for (const target of note.wikiLinks) {
        if (this.notes.has(target) && target !== note.id) {
          edges.push({ target, weight: 1.0, kind: "wiki" });
        }
      }

      // Semantic edges: cosine similarity above threshold.
      if (note.embedding) {
        for (const other of notes) {
          if (other.id === note.id || !other.embedding) continue;
          // Skip if already wiki-linked — wiki wins.
          if (edges.some((e) => e.target === other.id && e.kind === "wiki")) continue;
          const sim = cosine(note.embedding, other.embedding);
          if (sim >= this.config.similarityThreshold) {
            edges.push({ target: other.id, weight: sim, kind: "semantic" });
          }
        }
      }

      this.edges.set(note.id, edges);
    }
  }

  /**
   * THE core call. User opens a note — we record the visit, run spreading
   * activation over the (decayed) graph, combine with memory strength,
   * and return ranked neighbors for the Associative Recall panel.
   */
  focus(noteId: NoteId, now: number = Date.now()): RankedNeighbor[] {
    if (!this.notes.has(noteId)) return [];

    // Update state: note was just visited.
    const state = this.states.get(noteId);
    if (state) {
      state.lastVisited = now;
      state.visitCount += 1;
    }

    // Build a view of the graph with decayed semantic edge weights.
    const decayedAdjacency: AdjacencyMap = new Map();
    for (const [source, edges] of this.edges) {
      decayedAdjacency.set(
        source,
        edges.map((e) => ({
          ...e,
          weight: decayedWeight(e, source, this.edgeDecay, now, this.config),
        })),
      );
    }

    // Spreading activation from the focused note.
    const activations = spread(noteId, decayedAdjacency, this.config);

    // Reinforce the edges we just traversed.
    reinforceEdges(noteId, [...activations.keys()], this.edgeDecay, now);

    // Compute per-note memory strength using current degrees.
    const degrees = new Map<NoteId, number>();
    for (const [id, edges] of this.edges) degrees.set(id, edges.length);
    const strengths = computeAllStrengths(this.states, degrees, now, this.config);

    // Determine edge kinds from source noteId to neighbor for labeling.
    const sourceEdges = this.edges.get(noteId) ?? [];
    const kindByTarget = new Map<NoteId, "wiki" | "semantic" | "both">();
    for (const e of sourceEdges) {
      const prev = kindByTarget.get(e.target);
      if (!prev) kindByTarget.set(e.target, e.kind);
      else if (prev !== e.kind) kindByTarget.set(e.target, "both");
    }

    // Rank: activation × (strength baseline + small constant) so
    // never-visited notes can still appear.
    const ranked: RankedNeighbor[] = [];
    for (const [id, activation] of activations) {
      const note = this.notes.get(id);
      if (!note) continue;
      const strength = strengths.get(id) ?? 0;
      const score = activation * (0.5 + 0.5 * strength);
      ranked.push({
        id,
        title: note.title,
        score,
        activation,
        strength,
        decayed: score < this.config.fadeThreshold,
        kind: kindByTarget.get(id) ?? "semantic",
      });
    }

    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  pin(noteId: NoteId, pinned: boolean): void {
    const state = this.states.get(noteId);
    if (state) state.pinned = pinned;
  }

  getNote(noteId: NoteId): Note | undefined {
    return this.notes.get(noteId);
  }

  listNotes(): Note[] {
    return [...this.notes.values()];
  }

  /**
   * Flat list of all (deduped, undirected) edges for graph visualization.
   * Each pair of connected notes shows up once, tagged with its kind.
   * If a pair has both a wiki and a semantic edge, wiki wins for display.
   */
  listEdges(): Array<{
    source: NoteId;
    target: NoteId;
    weight: number;
    kind: "wiki" | "semantic";
  }> {
    type E = { source: NoteId; target: NoteId; weight: number; kind: "wiki" | "semantic" };
    const byKey = new Map<string, E>();
    for (const [source, edges] of this.edges) {
      for (const e of edges) {
        const [a, b] = source < e.target ? [source, e.target] : [e.target, source];
        const key = `${a}|${b}`;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, { source: a, target: b, weight: e.weight, kind: e.kind });
        } else if (e.kind === "wiki" && existing.kind !== "wiki") {
          byKey.set(key, { source: a, target: b, weight: e.weight, kind: "wiki" });
        }
      }
    }
    return [...byKey.values()];
  }

  /** Serialize learned state for IndexedDB persistence. */
  snapshot(): BrainEngineSnapshot {
    return {
      states: [...this.states.entries()],
      edgeDecay: [...this.edgeDecay.lastTraversed.entries()],
    };
  }

  /** Restore learned state from a previous session. */
  restore(snap: BrainEngineSnapshot): void {
    this.states = new Map(snap.states);
    this.edgeDecay = { lastTraversed: new Map(snap.edgeDecay) };
  }
}
