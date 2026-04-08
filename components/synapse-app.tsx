"use client";

// Synapse orchestrator: loads the vault, embeds each note via the
// web worker, ingests into the BrainEngine, and renders the three
// Obsidian-style panels (sidebar, viewer, Associative Recall).
//
// Kept as a single file for readability during v0. Split later if
// it grows — the engine itself is already isolated in lib/engine/.

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BrainEngine,
  type Note,
  type NoteId,
  type RankedNeighbor,
} from "@/lib/engine";
import { parseVault, markdownToEmbeddingText } from "@/lib/vault/parser";
import { loadVault } from "@/lib/vault/loader";
import {
  EmbeddingsClient,
  type EmbeddingsStatus,
} from "@/lib/embeddings/client";
import { GraphView } from "./graph-view";

type ViewMode = "reading" | "graph";

type LoadPhase =
  | { kind: "idle" }
  | { kind: "loading-vault" }
  | { kind: "loading-model"; stage: string; pct: number }
  | { kind: "embedding"; done: number; total: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export default function SynapseApp() {
  const [phase, setPhase] = useState<LoadPhase>({ kind: "idle" });
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<NoteId | null>(null);
  const [neighbors, setNeighbors] = useState<RankedNeighbor[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("reading");
  const engineRef = useRef<BrainEngine | null>(null);
  const embeddingsRef = useRef<EmbeddingsClient | null>(null);

  // One-time bootstrap: load vault, embed, ingest.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setPhase({ kind: "loading-vault" });
      const { files } = await loadVault("/test-vault");
      const parsed = parseVault(files);
      if (cancelled) return;

      const embeddings = new EmbeddingsClient();
      embeddingsRef.current = embeddings;
      const unsubscribe = embeddings.onStatus((s: EmbeddingsStatus) => {
        if (s.kind === "loading") {
          setPhase({ kind: "loading-model", stage: s.stage, pct: s.pct });
        } else if (s.kind === "error") {
          setPhase({ kind: "error", message: s.message });
        }
      });
      embeddings.start();

      // Embed each note's plaintext in sequence — MiniLM in-browser is
      // fast but batching is a later optimization.
      setPhase({ kind: "embedding", done: 0, total: parsed.length });
      for (let i = 0; i < parsed.length; i++) {
        const text = markdownToEmbeddingText(parsed[i].content);
        try {
          const vec = await embeddings.embed(text);
          parsed[i].embedding = vec;
        } catch (err) {
          setPhase({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        if (cancelled) return;
        setPhase({ kind: "embedding", done: i + 1, total: parsed.length });
      }

      const engine = new BrainEngine();
      engine.ingest(parsed);
      engineRef.current = engine;
      setNotes(parsed);
      setActiveId(parsed[0]?.id ?? null);
      setPhase({ kind: "ready" });

      return () => {
        unsubscribe();
      };
    }

    boot().catch((err) => {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    });

    return () => {
      cancelled = true;
      embeddingsRef.current?.terminate();
    };
  }, []);

  // Recompute neighbors whenever the focus changes.
  useEffect(() => {
    if (!activeId || !engineRef.current) return;
    const ranked = engineRef.current.focus(activeId);
    setNeighbors(ranked.slice(0, 10));
  }, [activeId]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeId) ?? null,
    [notes, activeId],
  );

  // Edges are computed from the engine once notes load. Must be declared
  // before the early return for LoadingScreen to respect rules of hooks.
  const edges = useMemo(() => {
    return engineRef.current?.listEdges() ?? [];
  }, [notes]);

  if (phase.kind !== "ready") {
    return <LoadingScreen phase={phase} />;
  }

  const handleSelectFromGraph = (id: NoteId) => {
    setActiveId(id);
    setViewMode("reading");
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-[#dcdcdc] font-sans">
      <Sidebar notes={notes} activeId={activeId} onSelect={setActiveId} />
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar
          viewMode={viewMode}
          onChange={setViewMode}
          title={activeNote?.title ?? ""}
        />
        {viewMode === "reading" ? (
          <Viewer note={activeNote} onWikiClick={setActiveId} notes={notes} />
        ) : (
          <GraphView
            notes={notes}
            edges={edges}
            activeId={activeId}
            onSelect={handleSelectFromGraph}
          />
        )}
      </div>
      <BrainPanel neighbors={neighbors} onSelect={setActiveId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar: reading / graph toggle + active note title.
// ---------------------------------------------------------------------------

function Toolbar({
  viewMode,
  onChange,
  title,
}: {
  viewMode: ViewMode;
  onChange: (m: ViewMode) => void;
  title: string;
}) {
  return (
    <div className="h-10 shrink-0 flex items-center justify-between px-4 border-b border-[#2a2a2a] bg-[#181818]">
      <div className="text-xs text-[#777] truncate">{title}</div>
      <div className="flex items-center gap-1 bg-[#1f1f1f] border border-[#2a2a2a] rounded-md p-0.5">
        <ToolbarButton
          active={viewMode === "reading"}
          onClick={() => onChange("reading")}
          label="Reading"
        />
        <ToolbarButton
          active={viewMode === "graph"}
          onClick={() => onChange("graph")}
          label="Graph"
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] rounded-sm transition-colors ${
        active
          ? "bg-[#2d2d2d] text-white"
          : "text-[#888] hover:text-[#ccc]"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sidebar: vault file tree (flat for v0).
// ---------------------------------------------------------------------------

function Sidebar({
  notes,
  activeId,
  onSelect,
}: {
  notes: Note[];
  activeId: NoteId | null;
  onSelect: (id: NoteId) => void;
}) {
  return (
    <aside className="w-60 shrink-0 border-r border-[#2a2a2a] bg-[#1a1a1a] overflow-y-auto">
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <div className="text-xs uppercase tracking-wider text-[#888]">
          Vault
        </div>
        <div className="text-sm font-medium mt-1">test-vault</div>
      </div>
      <nav className="py-2">
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            className={`w-full text-left px-4 py-1.5 text-sm hover:bg-[#262626] transition-colors ${
              activeId === n.id ? "bg-[#2d2d2d] text-white" : "text-[#bbb]"
            }`}
          >
            {n.title}
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Viewer: markdown renderer with wiki-link support.
// ---------------------------------------------------------------------------

function Viewer({
  note,
  notes,
  onWikiClick,
}: {
  note: Note | null;
  notes: Note[];
  onWikiClick: (id: NoteId) => void;
}) {
  if (!note) {
    return (
      <main className="flex-1 flex items-center justify-center text-[#666]">
        Select a note
      </main>
    );
  }

  // Quick wiki-link resolver for rendering — same logic as parser but
  // scoped to click handling.
  const lookup = useMemo(() => {
    const map = new Map<string, NoteId>();
    for (const n of notes) {
      const stem = n.path.replace(/\.md$/i, "").toLowerCase();
      map.set(stem, n.id);
      map.set(stem.split("/").pop() ?? stem, n.id);
    }
    return map;
  }, [notes]);

  // Pre-process wiki links into markdown links so react-markdown's
  // anchor renderer can hand us click events.
  const processed = useMemo(() => {
    return note.content.replace(
      /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g,
      (_, target: string, label?: string) => {
        const resolved = lookup.get(target.trim().toLowerCase());
        const display = label ?? target;
        if (!resolved) return `**${display}**`;
        return `[${display}](synapse://${encodeURIComponent(resolved)})`;
      },
    );
  }, [note.content, lookup]);

  return (
    <main className="flex-1 overflow-y-auto">
      <article className="max-w-3xl mx-auto px-10 py-12 prose prose-invert prose-headings:font-semibold prose-h1:text-3xl prose-a:text-[#7aa9ff] prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children, ...rest }) => {
              if (href?.startsWith("synapse://")) {
                const id = decodeURIComponent(href.slice("synapse://".length));
                return (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onWikiClick(id);
                    }}
                    className="text-[#9d7aff] border-b border-dotted border-[#9d7aff]/50"
                  >
                    {children}
                  </a>
                );
              }
              return (
                <a href={href} {...rest}>
                  {children}
                </a>
              );
            },
          }}
        >
          {processed}
        </ReactMarkdown>
      </article>
    </main>
  );
}

// ---------------------------------------------------------------------------
// BrainPanel: the Associative Recall sidebar — the demo moment.
// ---------------------------------------------------------------------------

function BrainPanel({
  neighbors,
  onSelect,
}: {
  neighbors: RankedNeighbor[];
  onSelect: (id: NoteId) => void;
}) {
  return (
    <aside className="w-80 shrink-0 border-l border-[#2a2a2a] bg-[#1a1a1a] overflow-y-auto">
      <div className="px-5 py-4 border-b border-[#2a2a2a]">
        <div className="text-xs uppercase tracking-wider text-[#888]">
          Associative Recall
        </div>
        <div className="text-sm mt-1 text-[#aaa]">
          What your brain is also thinking about
        </div>
      </div>

      {neighbors.length === 0 ? (
        <div className="px-5 py-8 text-sm text-[#666]">
          No associations yet. Open another note.
        </div>
      ) : (
        <ul className="py-2">
          {neighbors.map((n) => (
            <NeighborRow key={n.id} neighbor={n} onClick={() => onSelect(n.id)} />
          ))}
        </ul>
      )}

      <div className="px-5 py-4 mt-4 border-t border-[#2a2a2a] text-[10px] leading-relaxed text-[#555]">
        Dots scale with activation. Faded entries are decayed associations
        the engine thinks are cooling off. Click any note to follow the
        thought.
      </div>
    </aside>
  );
}

function NeighborRow({
  neighbor,
  onClick,
}: {
  neighbor: RankedNeighbor;
  onClick: () => void;
}) {
  const dot = neighbor.decayed
    ? "●"
    : neighbor.activation > 0.5
      ? "●"
      : neighbor.activation > 0.25
        ? "◉"
        : "○";
  const dotColor = neighbor.decayed
    ? "text-[#444]"
    : neighbor.kind === "wiki"
      ? "text-[#7aa9ff]"
      : neighbor.kind === "both"
        ? "text-[#c49aff]"
        : "text-[#9d7aff]";

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left px-5 py-2 hover:bg-[#262626] transition-colors flex items-center gap-3"
      >
        <span
          className={`text-lg leading-none ${dotColor} ${neighbor.decayed ? "opacity-40" : ""}`}
        >
          {dot}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm truncate ${neighbor.decayed ? "text-[#666]" : "text-[#ddd]"}`}
          >
            {neighbor.title}
          </div>
          <div className="text-[10px] text-[#666] mt-0.5">
            {(neighbor.activation * 100).toFixed(0)}% activation ·{" "}
            {neighbor.kind}
          </div>
        </div>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Loading screen: model download + indexing progress.
// ---------------------------------------------------------------------------

function LoadingScreen({ phase }: { phase: LoadPhase }) {
  const message =
    phase.kind === "idle"
      ? "Starting…"
      : phase.kind === "loading-vault"
        ? "Loading vault…"
        : phase.kind === "loading-model"
          ? `Loading embedding model (${phase.stage} ${phase.pct}%)`
          : phase.kind === "embedding"
            ? `Indexing notes (${phase.done}/${phase.total})`
            : phase.kind === "error"
              ? `Error: ${phase.message}`
              : "Ready";

  const pct =
    phase.kind === "loading-model"
      ? phase.pct
      : phase.kind === "embedding"
        ? Math.round((phase.done / Math.max(1, phase.total)) * 100)
        : 0;

  return (
    <div className="h-screen bg-[#1e1e1e] text-[#dcdcdc] flex flex-col items-center justify-center gap-6 font-sans">
      <div className="text-2xl font-semibold">Synapse</div>
      <div className="text-sm text-[#888]">{message}</div>
      <div className="w-80 h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#9d7aff] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-[#555] max-w-md text-center mt-4">
        Synapse runs fully in your browser. The embedding model loads once
        (~25MB) and is cached for future visits. Your notes never leave
        your machine.
      </div>
    </div>
  );
}
