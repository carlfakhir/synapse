# User Notes Design

Date: 2026-04-08
Project: Synapse
Status: Draft approved in conversation, pending file review

## Goal

Add a first-pass way for users to create their own notes inside Synapse and make it explicit that the bundled vault content is sample data.

This pass is intentionally small:

- Users can create notes from inside the app
- New notes participate in embeddings, graph view, wiki-link navigation, and associative recall
- User notes exist only for the current browser session
- The bundled vault remains present and clearly labeled as demo/sample content

This pass does not include persistence, file-system import, or replacing the demo vault.

## Product Decisions

- Input path: in-app composer
- Persistence: session-only
- Sample vault remains loaded by default
- User notes should appear immediately after save and become the active note
- Failure to embed a note should block save and surface a direct error

## UX

### Sample Data Messaging

The sidebar header should clearly state that the bundled notes are sample/demo content. The goal is to remove any ambiguity from the demo and current app state.

Expected copy direction:

- Header label remains vault-oriented
- Add a short badge or line such as `Demo vault`
- Add a one-sentence explanation that the loaded notes are bundled sample data

This messaging should be visible without opening a modal or tooltip.

### Note Creation Entry Point

Add a `New Note` action in the sidebar near the vault header or above the note list.

Clicking it opens a lightweight composer with:

- `Title` input
- `Markdown` body textarea
- `Cancel` button
- `Add note` button

The composer can be inline in the sidebar area or a simple modal. For this pass, choose the option that requires the least structural change while staying readable.

### Post-Save Behavior

After a successful save:

- The note is added to a `Your Notes` section in the sidebar
- The new note becomes the active note
- The viewer shows the new note immediately
- The note is included in graph view and associative recall

### Sidebar Organization

Separate user-created notes from bundled notes to preserve clarity.

Recommended structure:

- `Demo Vault` section for bundled sample notes
- `Your Notes` section for session-created notes

This avoids mixing user content into the sample list while keeping the underlying engine behavior unified.

## Technical Design

### Current State

The app currently:

- Loads markdown files from `/public/test-vault`
- Parses them into note objects
- Embeds each note client-side
- Ingests all notes into a single in-memory `BrainEngine`
- Derives graph edges and associative neighbors from that engine

### State Model

Split note state into two sources:

- `sampleNotes`: bundled notes loaded from `/test-vault`
- `userNotes`: notes created during the current session

Render and engine operations should use:

- `allNotes = sampleNotes + userNotes`

The active note id remains a single selection across both note groups.

### Save Flow

When a user submits a new note:

1. Validate title and body are non-empty after trimming
2. Create a session-scoped note id, for example `user/<slug>-<timestamp>`
3. Create a markdown-backed note object using the same parser-compatible shape used elsewhere in the app
4. Embed the note body using the existing `EmbeddingsClient`
5. Add the note to `userNotes`
6. Recompute the engine input from `sampleNotes + updatedUserNotes`
7. Re-ingest into `BrainEngine`
8. Set the new note as active

Rebuilding the engine from all notes is acceptable for this pass because the vault is small and the feature is session-scoped.

### Wiki-Link Resolution

Viewer wiki-link resolution should work across both bundled and user-created notes in the current session.

This means a user note can link to:

- bundled sample notes
- previously created user notes

If a target does not resolve, rendering should continue with the existing fallback behavior.

### Error Handling

If save validation fails:

- Keep the composer open
- Show a specific validation message
- Do not mutate state

If embedding fails:

- Keep the composer open
- Show a direct error message
- Do not add the note
- Do not rebuild the engine

If the note saves successfully but has weak or no associations:

- Still add the note normally
- Allow the engine to show low-signal or empty associative output

## Testing

Minimum test coverage for this feature:

1. Creating a valid user note adds it to user note state and makes it active
2. Empty title is rejected
3. Empty body is rejected
4. Sample/demo labeling is rendered
5. User notes are included in the combined note list used by the app
6. User notes are session-only and not loaded from persistent storage

For this pass, tests can focus on the pure state/update logic if UI-level test infrastructure is not already present.

## Non-Goals

- Persistence across reloads
- File System Access API integration
- Importing folders or arbitrary markdown files from disk
- Editing or deleting user-created notes
- Multiple vault management
- Replacing the sample vault with user-only mode

## Implementation Notes

- Keep the feature client-only and local-first
- Reuse the current embedding and engine pipeline rather than creating a parallel code path
- Prefer extracting a small pure helper for note creation / combined-note rebuilding if it improves testability
- Do not broaden scope into storage during this pass

## Open Questions Resolved

- First input path is in-app composer, not file import
- Persistence is session-only for now
- Bundled content should remain visible and explicitly labeled as sample/demo data
