## Implementation Prompt — Step 1: Repair the documentation link gate

### Objective

Make `bun run check:docs` exit 0 by repairing thirteen broken relative links, without moving,
renaming or deleting any document.

### Context

This is Lightframe Studio, a Bun workspace. `scripts/check-retired-program-references.mjs` and
`scripts/check-doc-links.mjs` are repository gates; the latter validates every relative link and
heading anchor in `README.md`, `AGENTS.md` and all of `docs/`.

Three documents — `LightFrameUXAudit.md`, `LightFrameUXImplementationPlan.md` and
`LightFrameSuperdesignPrompts.md` — have been moved from `docs/` into `docs/archived/`. The
referring documents were not updated, and relative links **inside** the two moved documents no
longer resolve from their new depth.

This step is a prerequisite for every other step in this roadmap: until the gate is green, no later
change can be validated honestly.

### User Problem

None directly. Contributors and agents cannot distinguish breakage they caused from breakage that
was already there.

### Required Behavior

`bun run check:docs` exits 0. Every link resolves to the document's real location. Nothing is moved.

### Existing Areas to Inspect

Run `bun run check:docs` first and work from its actual output — do not rely on the list below being
complete or current.

- `docs/README.md` — references the three moved documents in two separate tables
- `docs/product-audit/README.md`
- `docs/product-audit/03-ui-ux-audit.md`
- `docs/user-flows/gaps-and-usability-audit.md`
- `docs/archived/LightFrameSuperdesignPrompts.md` — its own link to `user-flows/feature-behavior/README.md`
- `docs/archived/LightFrameUXImplementationPlan.md` — its own link to `../CLAUDE.md`
- `docs/archived/README.md` — should list the three newly archived documents
- `scripts/check-doc-links.mjs` — to understand exactly what is validated

### Scope

- Update every referring link to the documents' current locations.
- Fix the relative links inside the two moved documents so they resolve from `docs/archived/`.
- Where a document is listed in a "where to find things" table, mark it as archived so a reader is
  not sent to historical material as if it were current.
- Add the three documents to `docs/archived/README.md` if that file indexes its contents.

### Out of Scope

- Moving, renaming, deleting or un-archiving any document.
- Rewriting the content of the archived documents beyond their broken links.
- Any change under `docs/product-audit/2026-08-26/`.
- Any source-code change.

### UX Requirements

None. Documentation only.

### Technical Requirements

- Audit before changing: run `bun run check:docs` and read its output before editing anything.
- Do not guess a path — confirm each target file exists.
- Preserve each link's surrounding sentence and its meaning. If a table row now points at archived
  material, say so in the row rather than deleting the row.
- Reuse the repository's existing conventions for describing archived material; do not invent a new
  label.
- Make no unrelated edits, no formatting sweep, and no reflowing of untouched lines.

### Acceptance Criteria

- `bun run check:docs` exits 0.
- Every link that the gate previously reported as broken now resolves to a file that exists.
- No file has been moved, renamed, created outside `docs/archived/README.md` edits, or deleted.
- Any table row that now points at `docs/archived/` states that the document is historical.
- `bun run format:check` passes.

### Regression Protection

A wrong replacement path swaps one broken link for another. The gate catches this, so run it to
completion and read every line of the output rather than stopping at the first success.

### Validation

Run only:

```bash
bun run check:docs && bun run format:check
```

Do not run the test suite, the build, or the full lint for this change.

### Completion Report

State: every file changed; every link updated and its new target; whether `docs/archived/README.md`
was touched; the exact output of both validation commands; and anything you found broken that you
deliberately did not fix, with the reason.
