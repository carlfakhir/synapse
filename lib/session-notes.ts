import type { Note } from "@/lib/engine";
import { parseVault } from "@/lib/vault/parser";

export interface SessionNoteInput {
  title: string;
  body: string;
}

export interface SessionNoteValidation {
  title: string | null;
  body: string | null;
}

export function validateSessionNoteInput(
  input: SessionNoteInput,
): SessionNoteValidation {
  return {
    title: input.title.trim() ? null : "Title is required.",
    body: input.body.trim() ? null : "Body is required.",
  };
}

export function slugifySessionTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildSessionNoteContent(title: string, body: string): string {
  return `# ${title.trim()}\n\n${body.trim()}`;
}

export function createSessionNote(
  existingNotes: Note[],
  input: SessionNoteInput,
): Note {
  const title = input.title.trim();
  const body = input.body.trim();
  const slug = slugifySessionTitle(title) || "note";
  const path = `user/${slug}-${Date.now()}.md`;
  const files = [
    ...existingNotes.map((note) => ({
      path: note.path,
      content: note.content,
    })),
    {
      path,
      content: buildSessionNoteContent(title, body),
    },
  ];

  const parsedNotes = parseVault(files);
  return parsedNotes[parsedNotes.length - 1];
}
