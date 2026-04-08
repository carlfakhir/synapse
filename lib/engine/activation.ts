// Spreading activation over the (wiki + semantic) note graph.
//
// Cognitive model: when a note is "focused" it receives activation = 1.0.
// Activation then flows to neighbors, scaled by edge weight and an
// alpha-per-hop decay. This is the classic Collins & Loftus (1975) model,
// bounded to a small depth so we don't light up the entire vault.

import type { Edge, NoteId, EngineConfig } from "./types";

export type AdjacencyMap = Map<NoteId, Edge[]>;

/**
 * Compute activation levels across the graph starting from `sourceId`.
 * Returns a map of noteId -> activation in [0, 1].
 *
 * We do a BFS up to `hops` levels. Each hop multiplies activation by
 * `alpha * edgeWeight`. If a node is reached by multiple paths we take
 * the max — it's the strongest associative pull, not the sum, that
 * matches human intuition ("this reminds me of X").
 */
export function spread(
  sourceId: NoteId,
  adjacency: AdjacencyMap,
  config: EngineConfig,
): Map<NoteId, number> {
  const activation = new Map<NoteId, number>();
  activation.set(sourceId, 1.0);

  let frontier: Array<[NoteId, number]> = [[sourceId, 1.0]];

  for (let hop = 0; hop < config.activationHops; hop++) {
    const nextFrontier: Array<[NoteId, number]> = [];
    for (const [nodeId, nodeAct] of frontier) {
      const edges = adjacency.get(nodeId) ?? [];
      for (const edge of edges) {
        const transferred =
          nodeAct * config.activationDecayPerHop * edge.weight;
        if (transferred < 0.01) continue;
        const prev = activation.get(edge.target) ?? 0;
        if (transferred > prev) {
          activation.set(edge.target, transferred);
          nextFrontier.push([edge.target, transferred]);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  // The source itself shouldn't appear in its own recall panel.
  activation.delete(sourceId);
  return activation;
}
