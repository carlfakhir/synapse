"use client";

// The Synapse demo is entirely client-side: it fetches a vault of
// markdown files from /public/test-vault, runs the embedding model in
// a web worker, and maintains the BrainEngine state in memory. There
// is no server rendering for this page — everything is interactive
// and depends on browser APIs (Worker, fetch, Float32Array).
import SynapseApp from "@/components/synapse-app";

export default function Home() {
  return <SynapseApp />;
}
