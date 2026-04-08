// Vault parsing — turn a collection of { path, content } pairs into
// Note objects ready for the engine. Resolves [[wikilinks]] against
// the set of known paths so the adjacency graph is built on real ids.

import type { Note, NoteId } from "@/lib/engine/types";

const WIKI_LINK_RE = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const H1_RE = /^#\s+(.+)$/m;

export interface RawFile {
  path: string;     // path within the vault, POSIX separators
  content: string;
}

/**
 * Build a lookup from possible wiki-link targets to canonical note ids.
 * Obsidian wiki-links can be:
 *   [[Attestation]]                  — by title/filename stem
 *   [[security/attestation]]         — by path without extension
 *   [[security/attestation.md]]      — by full path
 * We index all three.
 */
function buildLookup(paths: string[]): Map<string, NoteId> {
  const lookup = new Map<string, NoteId>();
  for (const path of paths) {
    const stem = path.replace(/\.md$/i, "");
    const base = stem.split("/").pop() ?? stem;
    lookup.set(path.toLowerCase(), path);
    lookup.set(stem.toLowerCase(), path);
    lookup.set(base.toLowerCase(), path);
  }
  return lookup;
}

function extractWikiLinks(content: string, lookup: Map<string, NoteId>): NoteId[] {
  const out: NoteId[] = [];
  const seen = new Set<NoteId>();
  let match: RegExpExecArray | null;
  WIKI_LINK_RE.lastIndex = 0;
  while ((match = WIKI_LINK_RE.exec(content)) !== null) {
    const raw = match[1].trim().toLowerCase();
    const resolved = lookup.get(raw);
    if (resolved && !seen.has(resolved)) {
      out.push(resolved);
      seen.add(resolved);
    }
  }
  return out;
}

function extractTitle(content: string, path: string): string {
  const h1 = content.match(H1_RE);
  if (h1) return h1[1].trim();
  const stem = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
  return stem.replace(/[-_]/g, " ");
}

/**
 * Produce Note objects without embeddings. Embeddings are filled in
 * asynchronously by the worker before the engine ingests them.
 */
export function parseVault(files: RawFile[]): Note[] {
  const paths = files.map((f) => f.path);
  const lookup = buildLookup(paths);

  return files.map((file) => ({
    id: file.path,
    path: file.path,
    title: extractTitle(file.content, file.path),
    content: file.content,
    wikiLinks: extractWikiLinks(file.content, lookup),
  }));
}

/**
 * Strip markdown formatting down to plain text for cleaner embeddings.
 * MiniLM is trained on prose, not wiki syntax — feeding it `[[Foo]]`
 * contaminates the vector.
 */
export function markdownToEmbeddingText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")        // fenced code
    .replace(/`[^`]*`/g, " ")                // inline code
    .replace(/\[\[([^\]|#]+?)(?:[#|][^\]]*)?\]\]/g, "$1") // wiki links -> label
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // md links -> label
    .replace(/^#+\s+/gm, "")                  // headings
    .replace(/[*_~]/g, "")                    // emphasis
    .replace(/\s+/g, " ")
    .trim();
}
