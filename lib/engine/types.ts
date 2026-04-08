// Core types for the Synapse brain engine.
// Kept framework-free so the engine can be unit-tested in isolation.

export type NoteId = string;

export interface Note {
  id: NoteId;           // relative path within the vault, e.g. "security/attestation.md"
  title: string;        // first H1 or filename
  path: string;         // same as id, kept for UI clarity
  content: string;      // raw markdown
  wikiLinks: NoteId[];  // explicit [[links]] resolved to note ids (may include unresolved)
  embedding?: Float32Array;
}

export interface Edge {
  target: NoteId;
  weight: number;       // 0..1 — semantic similarity or 1.0 for explicit wiki links
  kind: "wiki" | "semantic";
}

export interface NoteState {
  id: NoteId;
  lastVisited: number;  // epoch ms, 0 = never
  visitCount: number;
  pinned: boolean;
  activation: number;   // transient; recomputed per open
}

export interface RankedNeighbor {
  id: NoteId;
  title: string;
  score: number;        // final ranking score (activation × strength)
  activation: number;
  strength: number;
  decayed: boolean;     // true if faded below visibility threshold
  kind: "wiki" | "semantic" | "both";
}

export interface EngineConfig {
  similarityThreshold: number;   // minimum cosine sim to form a semantic edge
  activationDecayPerHop: number; // alpha — fraction of activation transferred per hop
  activationHops: number;        // how deep spreading activation goes
  strengthWeights: {
    recency: number;
    frequency: number;
    centrality: number;
    pin: number;
  };
  decayHalfLifeDays: number;     // activation half-life for recency scoring
  edgeDecayLambda: number;       // per-day edge weight decay for unused semantic edges
  fadeThreshold: number;         // score below this renders as "faded"
}

export const DEFAULT_CONFIG: EngineConfig = {
  similarityThreshold: 0.35,
  activationDecayPerHop: 0.55,
  activationHops: 2,
  strengthWeights: {
    recency: 0.35,
    frequency: 0.25,
    centrality: 0.2,
    pin: 0.2,
  },
  decayHalfLifeDays: 14,
  edgeDecayLambda: 0.02,
  fadeThreshold: 0.15,
};
