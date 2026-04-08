// Edge decay — semantic edges that haven't been traversed recently
// lose weight over time. Notes are never deleted; their associations
// just fade, matching how unused connections weaken in the brain.
//
// Wiki links (explicit) never decay. They're a deliberate user
// commitment — we respect that.

import type { Edge, EngineConfig, NoteId } from "./types";

const DAY_MS = 1000 * 60 * 60 * 24;

export interface EdgeDecayState {
  // key is `${source}→${target}|${kind}`
  lastTraversed: Map<string, number>;
}

export function edgeKey(source: NoteId, target: NoteId, kind: Edge["kind"]): string {
  return `${source}→${target}|${kind}`;
}

/**
 * Returns the effective (decayed) weight of a semantic edge given the
 * number of days since it was last traversed. Wiki edges pass through
 * unchanged.
 */
export function decayedWeight(
  edge: Edge,
  source: NoteId,
  state: EdgeDecayState,
  now: number,
  config: EngineConfig,
): number {
  if (edge.kind === "wiki") return edge.weight;
  const key = edgeKey(source, edge.target, edge.kind);
  const last = state.lastTraversed.get(key);
  if (last === undefined) return edge.weight; // fresh edge — no decay yet
  const days = Math.max(0, (now - last) / DAY_MS);
  return edge.weight * Math.exp(-config.edgeDecayLambda * days);
}

/**
 * Mark a set of edges as just-traversed. Called when the user opens
 * a note and the spreading-activation pass lights up its neighbors.
 */
export function reinforceEdges(
  source: NoteId,
  targets: NoteId[],
  state: EdgeDecayState,
  now: number,
): void {
  for (const target of targets) {
    state.lastTraversed.set(edgeKey(source, target, "semantic"), now);
  }
}
