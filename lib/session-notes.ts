import type { Note } from "@/lib/engine";
import { parseVault } from "@/lib/vault/parser";

export interface SessionNoteInput {
  title: string;
  body: string;
}

export type SessionNoteValidation =
  | {
      ok: true;
      title: string;
      body: string;
    }
  | {
      ok: false;
      message: string;
    };

export function validateSessionNoteInput(
  input: SessionNoteInput,
): SessionNoteValidation {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) {
    return { ok: false, message: "Title is required." };
  }

  if (!body) {
    return { ok: false, message: "Body is required." };
  }

  return {
    ok: true,
    title,
    body,
  };
}

export function slugifySessionTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "note";
}

export function buildSessionNoteContent(title: string, body: string): string {
  return `# ${title}\n\n${body}`;
}

export function createSessionNote(
  input: SessionNoteInput,
  existingNotes: Note[],
): Note {
  const validation = validateSessionNoteInput(input);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const slug = slugifySessionTitle(validation.title);
  const path = `user/${slug}-${Date.now()}.md`;
  const files = [
    ...existingNotes.map((note) => ({
      path: note.path,
      content: note.content,
    })),
    {
      path,
      content: buildSessionNoteContent(validation.title, validation.body),
    },
  ];

  const parsedNotes = parseVault(files);
  return parsedNotes[parsedNotes.length - 1];
}
