# Synapse

**An Obsidian-like notes app where connections behave like human memory — associative, decaying, and context-dependent.**

Most note apps treat links as static references. Open a note, see the same backlinks you saw last week. Synapse asks a different question: *what would note-taking feel like if connections worked more like the brain?* Open a note, and a side panel surfaces what your brain is **also** thinking about — based on semantic similarity, spreading activation through the graph, and decay of unused associations over time.

## Current capabilities

- **Associative recall, not backlinks.** Opening `Attestation` surfaces `Confidential Computing`, `Zero Trust`, and `GPU Security` — not because they share the word "attestation," but because they're semantically close in vector space.
- **Spreading activation.** When you focus a note, activation flows outward through the (wiki + semantic) graph, fading with distance. Classic Collins & Loftus spreading activation, bounded to two hops so the whole vault doesn't light up.
- **Memory strength.** Each note carries a composite score of recency, frequency, graph centrality, and explicit pinning. Recently touched notes feel more "present" in the panel, the way a thought from this morning lingers while one from last month doesn't.
- **Edge decay.** Semantic associations you never traverse lose weight over time. Notes are never deleted — their connections just fade, matching how unused memory associations weaken in the brain. Explicit wiki links never decay.
- **100% local.** The embedding model (`all-MiniLM-L6-v2`, ~25MB) runs in a web worker in your browser via `transformers.js`. No API keys, no cloud, no data leaves your machine.
- **Graph view.** Toggle from reading mode into a force-directed graph of the whole vault with solid wiki edges and dashed semantic edges.
- **Real local vault connection.** Synapse can connect to a markdown folder on your machine through the browser file system picker, switch between `Your Vault` and `Demo Data`, and reconnect or disconnect the folder later.

## Demo + local vaults

Open `associative-memory.md`. The Associative Recall panel lights up `embeddings`, `semantic-similarity`, `zettelkasten`, `spaced-repetition` — notes that cross cluster boundaries because they share conceptual ground, not tokens. Click one to follow the thought. Activation propagates; decay updates. That's the whole experience.

Synapse ships with a synthetic demo vault in `public/test-vault/` so the app works out of the box. The built-in notes are explicitly labeled as sample data. After that, you can connect your own local markdown folder and browse it with the same reader, graph, and associative recall flow.

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

To use your own notes:

1. Click `Connect Folder` in the sidebar
2. Pick a local folder containing markdown files
3. Switch between `Your Vault` and `Demo Data` as needed

At the moment, folder access depends on browser support for the File System Access API. Chromium-based browsers are the intended path.

## Why this exists

Synapse is less about file management and more about retrieval. The question behind the project is simple: if human memory is associative, weighted, and decaying, why do note apps mostly stop at folders and static backlinks?

This repo is an experiment in making that idea feel tangible in the browser.

## Roadmap

- Better vault re-scan/update flows for changed files
- Persist learned engine state across sessions
- Pin/unpin and other note controls in the UI
- Richer graph overlays (activation heatmaps, filtering, clustering)
- A desktop wrapper or plugin path if browser file access becomes too limiting

## License

MIT. Build on it, fork it, turn it into something better.

## Credits

Inspired by the Zettelkasten method, Collins & Loftus's spreading activation model, and a long-running curiosity about why note-taking apps still treat memory as a filesystem when the brain so obviously doesn't.
