// Memory strength — a per-note composite score that determines
// baseline prominence independent of the currently-focused note.
//
// Intuition: a note you opened yesterday should feel more "present"
// than one you opened six months ago, even if both are semantically
// close to what you're reading now.

import type { NoteState, EngineConfig, NoteId } from "./types";

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Exponential recency score in [0, 1].
 * Uses the same half-life the engine uses for decay so the two feel coherent.
 */
export function recencyScore(lastVisited: number, now: number, halfLifeDays: number): number {
  if (lastVisited === 0) return 0;
  const ageDays = Math.max(0, (now - lastVisited) / DAY_MS);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Frequency saturates — the 20th visit shouldn't matter 20x more than the first.
 */
export function frequencyScore(visitCount: number): number {
  return 1 - Math.exp(-visitCount / 5);
}

/**
 * Degree centrality normalized by the vault's max degree.
 * Proxy for "how connected this note is in your knowledge graph."
 */
export function centralityScore(degree: number, maxDegree: number): number {
  if (maxDegree === 0) return 0;
  return degree / maxDegree;
}

export interface StrengthInputs {
  state: NoteState;
  degree: number;
  maxDegree: number;
  now: number;
}

export function computeStrength(
  inputs: StrengthInputs,
  config: EngineConfig,
): number {
  const w = config.strengthWeights;
  const recency = recencyScore(
    inputs.state.lastVisited,
    inputs.now,
    config.decayHalfLifeDays,
  );
  const frequency = frequencyScore(inputs.state.visitCount);
  const centrality = centralityScore(inputs.degree, inputs.maxDegree);
  const pin = inputs.state.pinned ? 1 : 0;
  return (
    w.recency * recency +
    w.frequency * frequency +
    w.centrality * centrality +
    w.pin * pin
  );
}

export function computeAllStrengths(
  states: Map<NoteId, NoteState>,
  degrees: Map<NoteId, number>,
  now: number,
  config: EngineConfig,
): Map<NoteId, number> {
  let maxDegree = 0;
  for (const d of degrees.values()) if (d > maxDegree) maxDegree = d;

  const out = new Map<NoteId, number>();
  for (const [id, state] of states) {
    out.set(
      id,
      computeStrength(
        { state, degree: degrees.get(id) ?? 0, maxDegree, now },
        config,
      ),
    );
  }
  return out;
}
