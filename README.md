# Synapse

**An Obsidian-like notes app where connections behave like human memory — associative, decaying, and context-dependent.**

Most note apps treat links as static references. Open a note, see the same backlinks you saw last week. Synapse asks a different question: *what would note-taking feel like if connections worked more like the brain?* Open a note, and a side panel surfaces what your brain is **also** thinking about — based on semantic similarity, spreading activation through the graph, and decay of unused associations over time.

## What makes it different

- **Associative recall, not backlinks.** Opening `Attestation` surfaces `Confidential Computing`, `Zero Trust`, and `GPU Security` — not because they share the word "attestation," but because they're semantically close in vector space.
- **Spreading activation.** When you focus a note, activation flows outward through the (wiki + semantic) graph, fading with distance. Classic Collins & Loftus spreading activation, bounded to two hops so the whole vault doesn't light up.
- **Memory strength.** Each note carries a composite score of recency, frequency, graph centrality, and explicit pinning. Recently touched notes feel more "present" in the panel, the way a thought from this morning lingers while one from last month doesn't.
- **Edge decay.** Semantic associations you never traverse lose weight over time. Notes are never deleted — their connections just fade, matching how unused memory associations weaken in the brain. Explicit wiki links never decay.
- **100% local.** The embedding model (`all-MiniLM-L6-v2`, ~25MB) runs in a web worker in your browser via `transformers.js`. No API keys, no cloud, no data leaves your machine.

## The demo

Open `associative-memory.md`. The Associative Recall panel lights up `embeddings`, `semantic-similarity`, `zettelkasten`, `spaced-repetition` — notes that cross cluster boundaries because they share conceptual ground, not tokens. Click one to follow the thought. Activation propagates; decay updates. That's the whole experience.

Synapse ships with a 12-note synthetic test vault in `public/test-vault/` spanning three semantic clusters (security/trust, AI/ML, knowledge) with deliberate cross-cluster connections so the demo works out of the box.

## Architecture

```
lib/engine/              # Pure TS brain engine — framework-free, unit-testable
  similarity.ts          # Allocation-free cosine over Float32Array
  activation.ts          # Bounded spreading activation (BFS, per-hop decay)
  strength.ts            # Recency / frequency / centrality / pin composite
  decay.ts               # Exponential decay of unused semantic edges
  index.ts               # BrainEngine: ingest, focus, snapshot, restore

lib/vault/               # Markdown + wiki-link parsing, vault loading
lib/embeddings/          # Main-thread client for the embeddings worker
workers/embeddings.worker.ts   # transformers.js host off the main thread

components/synapse-app.tsx     # Three-panel UI (sidebar, viewer, brain panel)
app/page.tsx                   # Client-only shell

public/test-vault/       # 12-note demo vault
```

The engine is the product. The UI is the demo.

## Running locally

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. First load downloads the embedding model (~25MB, cached thereafter) and indexes the 12-note demo vault. Subsequent loads are instant.

## What's next (not in v0)

- Point it at your own vault via the File System Access API
- IndexedDB persistence so learned state survives reloads
- Pin/unpin from the UI
- Global graph view with activation heatmap
- Obsidian plugin wrapper that reuses the engine as a dependency

## License

MIT. Build on it, fork it, turn it into something better.

## Credits

Inspired by the Zettelkasten method, Collins & Loftus's spreading activation model, and a long-running curiosity about why note-taking apps still treat memory as a filesystem when the brain so obviously doesn't.
