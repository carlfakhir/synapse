import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "./engine";
import {
  buildSessionNoteContent,
  createSessionNote,
  slugifySessionTitle,
  validateSessionNoteInput,
} from "./session-notes";

const SAMPLE_NOTES: Note[] = [
  {
    id: "user/original-note-1.md",
    path: "user/original-note-1.md",
    title: "Original Note",
    content: "# Original Note\n\nExisting body",
    wikiLinks: [],
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("session note helpers", () => {
  it("rejects an empty title", () => {
    expect(validateSessionNoteInput({ title: "  ", body: "Body" })).toEqual({
      ok: false,
      message: "Title is required.",
    });
  });

  it("rejects an empty body", () => {
    expect(validateSessionNoteInput({ title: "Title", body: "   " })).toEqual({
      ok: false,
      message: "Body is required.",
    });
  });

  it("builds and parses a session note from sample notes", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    expect(slugifySessionTitle("Session Note")).toBe("session-note");
    expect(slugifySessionTitle("  Session   -- Note  ")).toBe("session-note");
    expect(slugifySessionTitle("   ")).toBe("note");
    expect(buildSessionNoteContent("Session Note", "Link to [[original-note-1]]")).toBe(
      "# Session Note\n\nLink to [[original-note-1]]",
    );

    expect(
      createSessionNote(
        {
          title: "Session Note",
          body: "Link to [[original-note-1]]",
        },
        SAMPLE_NOTES,
      ),
    ).toEqual({
      id: "user/session-note-1700000000000.md",
      path: "user/session-note-1700000000000.md",
      title: "Session Note",
      content: "# Session Note\n\nLink to [[original-note-1]]",
      wikiLinks: ["user/original-note-1.md"],
    });
  });

  it("throws on invalid input", () => {
    expect(() =>
      createSessionNote(
        {
          title: "   ",
          body: "Body",
        },
        SAMPLE_NOTES,
      ),
    ).toThrow("Title is required.");
  });
});
