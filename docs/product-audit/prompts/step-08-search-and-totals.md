## Implementation Prompt — Step 8: Find anything by name

### Objective

Add text search and real totals to the Videos, Projects and Campaigns lists.

### Context

Lightframe Studio is a local-first, single-operator browser video studio (Bun workspace; React 19
front end, Bun + Elysia API, Zod contracts shared by both).

There is **no text search anywhere** in the product for Videos, Projects or Campaigns. The list
contracts in `packages/contracts` carry `cursor`, `pageSize`, filters and sort — and no search
parameter:

- `savedVideosQuerySchema` — `cursor`, `pageSize`, `characterName`, `format`, `sort`
- the project list query — `lifecycle`, `campaignId`, `cursor`, `pageSize`
- the campaign list query — `cursor`, `pageSize`

Lists also report `{projects.length} loaded` rather than a total, so "1 loaded" is the only count an
operator ever sees.

**Important:** Project and Campaign persistence has **two** implementations that must behave
identically — `apps/api/src/features/projects/file-project-repository.ts` (file mode) and
`apps/api/src/infrastructure/database/project-repository.ts` (Drizzle). A divergence here is a silent
bug.

### User Problem

Past roughly one page, the only way to find something is to scroll. The operator cannot tell how much
they have.

### Required Behavior

- Each of the three list surfaces has a search input that filters by title/name.
- Search composes with the existing filters and sort.
- Cursor pagination remains correct while a search is active.
- Counts show a real total (or an explicit bounded ceiling), not "N loaded".

### Existing Areas to Inspect

- `packages/contracts/src/saved-videos.ts`, `projects.ts`, `campaigns.ts` — the list query and
  response schemas
- `apps/api/src/features/saved-videos/saved-video-repository.ts` and
  `apps/api/src/infrastructure/database/saved-video-repository.ts`
- `apps/api/src/features/projects/file-project-repository.ts` and
  `apps/api/src/infrastructure/database/project-repository.ts` — **both** must be updated
- `apps/api/src/infrastructure/database/campaign-repository.ts`
- `apps/api/src/features/*/routes.ts` — query parsing for the three list endpoints
- `apps/web/src/features/projects/` (list surface from step 6), `useProjectsController.ts`
- `apps/web/src/features/campaigns/useCampaignsController.ts`
- `apps/web/src/features/video-gallery/VideoGallery.tsx` — the existing filter row to extend
- `apps/web/src/features/voice-effects/VoiceLibrary.tsx` — the one existing search input in the
  product; match its behaviour and its "Search begins after N characters" hint pattern
- `apps/api/src/route-inventory.test.ts` — must stay green (no new routes should be needed)

### Scope

- A bounded `search` parameter on the three list query schemas.
- Implementation in every affected repository, including **both** Project repositories.
- A debounced, clearable search input on each of the three surfaces.
- A real total replacing "N loaded".

### Out of Scope

- Full-text search across prompts, transcripts or reference images.
- Fuzzy or ranked matching.
- Search across Characters and Outfits — the Wardrobe library already has one.
- Saved searches, search history or global cross-entity search.
- New endpoints.

### UX Requirements

- Debounced input with a clear control, matching `VoiceLibrary`'s established behaviour and hint
  copy.
- The empty state must reflect the active term: "No Projects match 'launch'", with a way to clear.
- Announce result counts through a polite live region.
- The input must be keyboard-reachable and correctly labelled; use the existing form primitives.
- Preserve the existing filter controls' position and behaviour; search joins them, it does not
  replace them.

### Technical Requirements

- Bound the term in the **contract** — trim, minimum and maximum length, case-insensitive
  containment — not in each repository. Repositories receive an already-validated term.
- Escape or parameterize the term correctly in the Drizzle implementation. Never interpolate it into
  SQL.
- Cursor pagination must remain stable under an active search: the cursor must encode the same
  ordering the search result uses.
- Totals must not become an unbounded `COUNT(*)` on every keystroke. Either return a total alongside
  the page, or return an explicit bounded ceiling ("more than 50") and render it honestly.
- The file and Drizzle Project repositories must return identical results for the same term — add a
  test that asserts this directly.
- Do not add polling. Do not refetch on every keystroke — debounce.

### Acceptance Criteria

1. Each of the three lists filters by a typed term and restores fully when cleared.
2. Search composes correctly with the existing filters (character, format, sort; lifecycle,
   campaign).
3. Cursor pagination is correct while a search is active — page two of a search contains the next
   matching records, not the next records overall.
4. Counts show a real total or an explicit bounded ceiling; "N loaded" no longer appears.
5. The file and Drizzle Project repositories return identical results for the same term, asserted by
   a test.
6. The search input is labelled, keyboard-operable and announces its result count.
7. `apps/api/src/route-inventory.test.ts` passes unchanged.

### Regression Protection

- Existing list tests, cursor tests and filter tests must pass without weakening.
- Verify an empty or whitespace-only term behaves exactly as no term.
- Verify a term longer than the maximum is rejected by the contract, not silently truncated in a
  repository.
- Verify the Dashboard's list queries (which reuse these controllers) are unaffected when no term is
  supplied.

### Validation

```bash
bun run typecheck && npx vitest run packages/contracts apps/api/src/features/projects apps/api/src/features/campaigns apps/api/src/features/saved-videos apps/api/src/infrastructure apps/web/src/features/projects apps/web/src/features/campaigns apps/web/src/features/video-gallery
```

### Completion Report

Report the parameter name and its bounds, every repository updated (naming both Project
implementations explicitly), how cursor stability under search was preserved, how totals are computed
and bounded, the parity test added, and the surfaces updated.

### Working rules

Audit the affected area before changing it — read both Project repository implementations before
editing either. Confirm step 6 has landed. Reuse the existing form primitives and the `VoiceLibrary`
search behaviour rather than inventing a new pattern. Make no unrelated changes and remove no
existing functionality. Do not guess at repository semantics; trace them. Maintain responsive
behaviour, accessibility and performance — debounce, and do not introduce an unbounded count. Run
only the checks above. Report exactly what changed.
