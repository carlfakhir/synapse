import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/lib/engine";
import {
  buildSessionNoteContent,
  createSessionNote,
  slugifySessionTitle,
  validateSessionNoteInput,
} from "./session-notes";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("session note helpers", () => {
  it("validates required title and body fields", () => {
    expect(validateSessionNoteInput({ title: "  ", body: "Body" })).toEqual({
      title: "Title is required.",
      body: null,
    });

    expect(validateSessionNoteInput({ title: "Title", body: "   " })).toEqual({
      title: null,
      body: "Body is required.",
    });
  });

  it("creates a parser-compatible note from existing notes and the new note", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    const existingNotes: Note[] = [
      {
        id: "user/original-note-1.md",
        path: "user/original-note-1.md",
        title: "Original Note",
        content: "# Original Note\n\nExisting body",
        wikiLinks: [],
      },
    ];

    expect(slugifySessionTitle("Session Note")).toBe("session-note");
    expect(buildSessionNoteContent("Session Note", "Link to [[original-note-1]]")).toBe(
      "# Session Note\n\nLink to [[original-note-1]]",
    );

    expect(
      createSessionNote(existingNotes, {
        title: "Session Note",
        body: "Link to [[original-note-1]]",
      }),
    ).toEqual({
      id: "user/session-note-1700000000000.md",
      path: "user/session-note-1700000000000.md",
      title: "Session Note",
      content: "# Session Note\n\nLink to [[original-note-1]]",
      wikiLinks: ["user/original-note-1.md"],
    });
  });
});
