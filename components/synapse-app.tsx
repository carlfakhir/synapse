"use client";

// Synapse orchestrator: loads the vault, embeds each note via the
// web worker, ingests into the BrainEngine, and renders the three
// Obsidian-style panels (sidebar, viewer, Associative Recall).
//
// Kept as a single file for readability during v0. Split later if
// it grows — the engine itself is already isolated in lib/engine/.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BrainEngine,
  type Note,
  type NoteId,
  type RankedNeighbor,
} from "@/lib/engine";
import {
  parseVault,
  markdownToEmbeddingText,
  type RawFile,
} from "@/lib/vault/parser";
import { loadVault } from "@/lib/vault/loader";
import {
  EmbeddingsClient,
  type EmbeddingsStatus,
} from "@/lib/embeddings/client";
import {
  chooseVaultSource,
  hasDirectoryReadPermission,
  readMarkdownFilesFromDirectory,
  requestDirectoryReadPermission,
  supportsDirectoryPicker,
  type DirectoryHandle,
  type ImportedVaultFile,
  type VaultSource,
} from "@/lib/imported-vault";
import {
  clearStoredVaultHandle,
  loadStoredVaultHandle,
  loadStoredVaultSource,
  saveStoredVaultHandle,
  saveStoredVaultSource,
} from "@/lib/imported-vault-storage";
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
  const [demoFiles, setDemoFiles] = useState<RawFile[]>([]);
  const [importedFiles, setImportedFiles] = useState<ImportedVaultFile[]>([]);
  const [vaultSource, setVaultSource] = useState<VaultSource>("demo");
  const [connectedFolderName, setConnectedFolderName] = useState<string | null>(null);
  const [hasStoredFolder, setHasStoredFolder] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<NoteId | null>(null);
  const [neighbors, setNeighbors] = useState<RankedNeighbor[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("reading");
  const [vaultNotice, setVaultNotice] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const engineRef = useRef<BrainEngine | null>(null);
  const embeddingsRef = useRef<EmbeddingsClient | null>(null);

  const buildHydratedNotes = async (files: Array<RawFile | ImportedVaultFile>) => {
    const resolvedSource =
      files.length > 0 ? files : [];
    const parsed = parseVault(resolvedSource);

    setPhase({ kind: "embedding", done: 0, total: parsed.length });
    for (let i = 0; i < parsed.length; i++) {
      const text = markdownToEmbeddingText(parsed[i].content);
      parsed[i].embedding = await embeddingsRef.current!.embed(text);
      setPhase({ kind: "embedding", done: i + 1, total: parsed.length });
    }

    return parsed;
  };

  const applyHydratedNotes = ({
    nextSource,
    parsed,
    preferredActiveId,
  }: {
    nextSource: VaultSource;
    parsed: Note[];
    preferredActiveId?: NoteId | null;
  }) => {
    const engine = new BrainEngine();
    engine.ingest(parsed);
    engineRef.current = engine;
    setNotes(parsed);
    setVaultSource(nextSource);
    setActiveId(
      preferredActiveId && parsed.some((note) => note.id === preferredActiveId)
        ? preferredActiveId
        : parsed[0]?.id ?? null,
    );
    setViewMode("reading");
    setPhase({ kind: "ready" });
  };

  const hydrateVault = async ({
    nextSource,
    nextDemoFiles,
    nextImportedFiles,
    preferredActiveId,
  }: {
    nextSource: VaultSource;
    nextDemoFiles: RawFile[];
    nextImportedFiles: ImportedVaultFile[];
    preferredActiveId?: NoteId | null;
  }) => {
    const resolvedSource =
      nextImportedFiles.length > 0 ? nextSource : ("demo" as VaultSource);
    const activeFiles =
      resolvedSource === "imported" ? nextImportedFiles : nextDemoFiles;
    const parsed = await buildHydratedNotes(activeFiles);

    applyHydratedNotes({
      nextSource: resolvedSource,
      parsed,
      preferredActiveId,
    });
  };

  // One-time bootstrap: load vault, embed, ingest.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    async function boot() {
      setPhase({ kind: "loading-vault" });
      const [{ files }, storedHandle, storedSource] = await Promise.all([
        loadVault("/test-vault"),
        loadStoredVaultHandle<DirectoryHandle>(),
        loadStoredVaultSource(),
      ]);
      if (cancelled) return;

      const embeddings = new EmbeddingsClient();
      embeddingsRef.current = embeddings;
      unsubscribe = embeddings.onStatus((s: EmbeddingsStatus) => {
        if (s.kind === "loading") {
          setPhase({ kind: "loading-model", stage: s.stage, pct: s.pct });
        } else if (s.kind === "error") {
          setPhase({ kind: "error", message: s.message });
        }
      });
      embeddings.start();
      setDemoFiles(files);
      let persistedImportedFiles: ImportedVaultFile[] = [];
      let initialSource: VaultSource = "demo";
      setHasStoredFolder(Boolean(storedHandle));

      if (storedHandle) {
        setConnectedFolderName(storedHandle.name ?? "Connected folder");
        try {
          if (await hasDirectoryReadPermission(storedHandle)) {
            persistedImportedFiles = await readMarkdownFilesFromDirectory(storedHandle);
            initialSource =
              storedSource && persistedImportedFiles.length > 0
                ? storedSource
                : chooseVaultSource(persistedImportedFiles.length > 0);
            setVaultNotice(
              persistedImportedFiles.length > 0
                ? `Connected to ${storedHandle.name}.`
                : "Connected folder does not contain markdown notes yet.",
            );
          } else {
            setVaultNotice(
              "Folder access needs to be reconnected before Synapse can read your local vault.",
            );
          }
        } catch {
          persistedImportedFiles = [];
          initialSource = "demo";
          setVaultError(
            "Connected folder could not be read. Falling back to bundled demo data.",
          );
          setVaultNotice(
            "Reconnect the folder or disconnect it to clear the stale local-vault link.",
          );
        }
      } else {
        setVaultNotice(
          "Viewing bundled demo data. Connect a local markdown folder to make this your vault.",
        );
      }

      setImportedFiles(persistedImportedFiles);

      try {
        await hydrateVault({
          nextSource: initialSource,
          nextDemoFiles: files,
          nextImportedFiles: persistedImportedFiles,
        });
      } catch (err) {
        if (initialSource === "imported" && persistedImportedFiles.length > 0) {
          setVaultError(
            "Connected folder failed to load. Falling back to bundled demo data.",
          );
          setVaultNotice("Viewing bundled demo data.");
          await saveStoredVaultSource("demo");
          await hydrateVault({
            nextSource: "demo",
            nextDemoFiles: files,
            nextImportedFiles: [],
          });
          return;
        }

        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    boot().catch((err) => {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
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
  const hasLocalVaultConnection =
    importedFiles.length > 0 || hasStoredFolder || connectedFolderName !== null;

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

  const handleConnectFolder = async () => {
    setVaultError(null);
    setVaultNotice("Connecting local markdown folder...");

    try {
      const pickerWindow = window as Window & {
        showDirectoryPicker?: () => Promise<DirectoryHandle>;
      };
      if (!supportsDirectoryPicker(pickerWindow)) {
        setVaultError("This browser does not support local folder access.");
        setVaultNotice(null);
        return;
      }
      const handle = await pickerWindow.showDirectoryPicker();
      const permissionGranted = await requestDirectoryReadPermission(handle);
      if (!permissionGranted) {
        setVaultError("Folder access was not granted.");
        setVaultNotice(null);
        return;
      }

      const nextImportedFiles = await readMarkdownFilesFromDirectory(handle);
      if (nextImportedFiles.length === 0) {
        setVaultError("No markdown files found in that folder.");
        setVaultNotice(null);
        return;
      }

      await hydrateVault({
        nextSource: "imported",
        nextDemoFiles: demoFiles,
        nextImportedFiles,
      });
      const handleSaved = await saveStoredVaultHandle(handle);
      const sourceSaved = await saveStoredVaultSource("imported");
      setImportedFiles(nextImportedFiles);
      setConnectedFolderName(handle.name);
      setHasStoredFolder(handleSaved);
      setVaultNotice(
        handleSaved && sourceSaved
          ? `Connected ${handle.name}. Synapse will reuse this local folder when the browser allows it.`
          : `Connected ${handle.name} for this session, but the browser did not persist the folder handle.`,
      );
    } catch (err) {
      setPhase({ kind: "ready" });
      setVaultError(
        err instanceof Error ? err.message : "Failed to connect folder.",
      );
      setVaultNotice(null);
    }
  };

  const handleSwitchVault = async (nextSource: VaultSource) => {
    const resolvedSource =
      importedFiles.length > 0 ? nextSource : ("demo" as VaultSource);
    try {
      await hydrateVault({
        nextSource: resolvedSource,
        nextDemoFiles: demoFiles,
        nextImportedFiles: importedFiles,
        preferredActiveId: null,
      });
      const sourceSaved = await saveStoredVaultSource(resolvedSource);
      setVaultError(null);
      setVaultNotice(
        !sourceSaved
          ? "Switched vaults for this session, but browser persistence is unavailable."
          : resolvedSource === "imported"
          ? "Using your imported vault."
          : "Viewing bundled demo data.",
      );
    } catch (err) {
      setPhase({ kind: "ready" });
      setVaultError(
        err instanceof Error ? err.message : "Failed to switch vaults.",
      );
    }
  };

  const handleClearImportedVault = async () => {
    const cleared = await clearStoredVaultHandle();
    const sourceSaved = await saveStoredVaultSource("demo");
    setImportedFiles([]);
    setConnectedFolderName(null);
    setHasStoredFolder(false);
    setVaultError(null);
    setVaultNotice(
      cleared && sourceSaved
        ? "Disconnected the local vault and returned to bundled demo data."
        : "Disconnected the local vault for this session, but browser persistence is unavailable.",
    );
    await hydrateVault({
      nextSource: "demo",
      nextDemoFiles: demoFiles,
      nextImportedFiles: [],
      preferredActiveId: null,
    });
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-[#dcdcdc] font-sans">
      <Sidebar
        notes={notes}
        activeId={activeId}
        activeSource={vaultSource}
        hasImportedVault={importedFiles.length > 0}
        hasLocalVaultConnection={hasLocalVaultConnection}
        hasStoredFolder={hasStoredFolder}
        connectedFolderName={connectedFolderName}
        vaultNotice={vaultNotice}
        vaultError={vaultError}
        onSelect={setActiveId}
        onConnectFolder={handleConnectFolder}
        onSwitchSource={handleSwitchVault}
        onClearImportedVault={handleClearImportedVault}
      />
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
  activeSource,
  hasImportedVault,
  hasLocalVaultConnection,
  hasStoredFolder,
  connectedFolderName,
  vaultNotice,
  vaultError,
  onSelect,
  onConnectFolder,
  onSwitchSource,
  onClearImportedVault,
}: {
  notes: Note[];
  activeId: NoteId | null;
  activeSource: VaultSource;
  hasImportedVault: boolean;
  hasLocalVaultConnection: boolean;
  hasStoredFolder: boolean;
  connectedFolderName: string | null;
  vaultNotice: string | null;
  vaultError: string | null;
  onSelect: (id: NoteId) => void;
  onConnectFolder: () => void;
  onSwitchSource: (source: VaultSource) => void;
  onClearImportedVault: () => void;
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-[#2a2a2a] bg-[#1a1a1a] overflow-y-auto">
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#888]">
              Vault
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="text-sm font-medium">
                {activeSource === "imported" && hasImportedVault
                  ? connectedFolderName || "Your Vault"
                  : "Demo Vault"}
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                  activeSource === "imported" && hasLocalVaultConnection
                    ? "border-[#1e5f4a] bg-[#11352c] text-[#8be0b8]"
                    : "border-[#5a4c2f] bg-[#322717] text-[#d9b980]"
                }`}
              >
                {activeSource === "imported" && hasLocalVaultConnection
                  ? hasStoredFolder
                    ? "Persistent"
                    : "Session"
                  : "Sample Data"}
              </span>
            </div>
          </div>
          <button
            onClick={onConnectFolder}
            className="rounded-md border border-[#3a3a3a] bg-[#202020] px-3 py-1.5 text-[11px] font-medium text-[#eee] hover:bg-[#292929]"
          >
            {hasLocalVaultConnection ? "Reconnect" : "Connect Folder"}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[#777]">
          {hasLocalVaultConnection
            ? hasStoredFolder
              ? "Synapse is reading markdown from a local folder on this device. Demo data stays separate."
              : "Synapse is reading a local folder for this session only. Demo data stays separate."
            : "These built-in notes are sample data only. Connect a local markdown folder to make this your vault."}
        </p>
        {hasLocalVaultConnection ? (
          <div className="mt-3 flex items-center gap-2">
            <SourceButton
              active={activeSource === "imported" && hasImportedVault}
              label="Your Vault"
              onClick={() => onSwitchSource("imported")}
            />
            <SourceButton
              active={activeSource === "demo"}
              label="Demo Data"
              onClick={() => onSwitchSource("demo")}
            />
            <button
              onClick={onClearImportedVault}
              className="ml-auto rounded-md px-2 py-1 text-[11px] text-[#999] hover:bg-[#262626]"
            >
              Disconnect
            </button>
          </div>
        ) : null}
        {vaultNotice ? (
          <div className="mt-2 text-[11px] text-[#8be0b8]">{vaultNotice}</div>
        ) : null}
        {vaultError ? (
          <div className="mt-2 text-[11px] text-[#ff8a8a]">{vaultError}</div>
        ) : null}
      </div>
      <nav className="py-2">
        {notes.length === 0 ? (
          <div className="px-4 py-3 text-sm text-[#666]">
            No notes loaded for this vault yet.
          </div>
        ) : (
          notes.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={`w-full text-left px-4 py-1.5 text-sm hover:bg-[#262626] transition-colors ${
                activeId === n.id ? "bg-[#2d2d2d] text-white" : "text-[#bbb]"
              }`}
            >
              {n.title}
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}

function SourceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "bg-[#2d2d2d] text-white"
          : "bg-[#202020] text-[#999] hover:bg-[#292929]"
      }`}
    >
      {label}
    </button>
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
