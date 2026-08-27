## Implementation Prompt — Step 9: Find a character or an outfit by name

### Objective

Add search to the Saved Characters and Saved Outfits libraries, matching the pattern the rest of the
product already uses.

### Context

Lightframe Studio has four asset libraries: Videos, Characters, Outfits and Voices. Three of them can
be searched. Projects and Campaigns can be searched too — `listSearchSchema` appears in
`packages/contracts/src/{projects,campaigns,saved-videos}.ts` and `voices.ts` has its own bounded
search.

**Characters and Outfits cannot.** `apps/web/src/features/account-library/SavedCreativeLibrary.tsx`
renders `items.map(...)` over the whole collection — no search, no filter, no sort, no pagination.

These are the two libraries whose contents cost real provider money to generate, and the ones most
likely to accumulate. A running instance already showed 20 saved voices against 1 character and 1
outfit; the character and outfit counts grow with every generation.

Unlike Videos, these assets are **browser-local and mirrored to the account**, not paged from the
server, so this is a client-side filter over a store that is already in memory.

### User Problem

The libraries whose contents are most expensive to create are the only ones that cannot be searched,
and they grow without bound.

### Required Behavior

- Both libraries can be searched by name.
- The result count reflects the filtered list.
- A search with no matches shows the search-empty state with a clear affordance — not the first-run
  empty state, which says something different and offers a different action.
- Existing selection, use, wardrobe and delete actions are unchanged.

### Existing Areas to Inspect

Read the existing search implementation and copy it rather than inventing a variant.

- `apps/web/src/features/account-library/SavedCreativeLibrary.tsx` — `SavedCharacterLibrary` (line
  ~193) and `SavedOutfitLibrary` (line ~330)
- `apps/web/src/ui/primitives/useListSearch.ts` — the debounce, `term` and `clear`
- `apps/web/src/ui/primitives/ListSearchField.tsx` — including the "Search begins after 2 characters"
  hint
- `apps/web/src/ui/primitives/SearchEmptyState.tsx` — its `noun`, `term` and `onClear` props
- `apps/web/src/features/projects/ProjectsListSurface.tsx` — the reference implementation: search
  field, polite result count, and a search-empty state distinct from the first-run empty state
- `apps/web/src/features/video-gallery/VideoGallery.tsx` — the same pattern with filters alongside
- `apps/web/src/features/creative-assets/repository.ts` — where the character and outfit stores come
  from, and what fields they carry
- `apps/web/src/studio/StudioLibraryOverlays.tsx` — how these libraries are mounted as overlays

### Scope

- Add `ListSearchField` and a polite result count to both libraries.
- Filter the in-memory store by name.
- Add `SearchEmptyState` for the no-match case.

### Out of Scope

- Server-side search, a new contract, or a new endpoint. These stores are local.
- Filtering by anything other than name.
- Sorting.
- Pagination or virtualisation. If the store is large enough that rendering it is slow, **note it in
  your report** rather than building it here.
- Any change to how characters and outfits are created, used, mirrored or deleted.
- The Voices library, which already has search.

### UX Requirements

- Behave identically to the Projects and Videos search: the same "Search begins after 2 characters"
  hint, the same debounce, a `role="status"` `aria-live="polite"` result count that does not
  interrupt typing, and the same clear affordance.
- The search-empty state must be visually and textually distinct from the first-run empty state.
- Search must be reachable by keyboard and must not steal focus when the overlay opens.
- These libraries are overlays; check the layout at 375 px, where the overlay is full-width.
- Do not push the first result below the fold on a phone — keep the search row compact.

### Technical Requirements

- Reuse `useListSearch`, `ListSearchField` and `SearchEmptyState` exactly. Do not write a new hook or
  a new field component.
- Filter in memory. Do not add a network round-trip for a local store.
- Match case-insensitively on the asset's display name, and match the same way in both libraries.
- Keep the filter derivation memoised so typing does not re-render the whole grid unnecessarily.
- Do not change the shape of the creative asset store.

### Acceptance Criteria

- Both the Characters and Outfits libraries offer search by name.
- Typing filters the list, case-insensitively, after the same threshold the rest of the product uses.
- The count reflects the filtered list and is announced politely.
- No matches shows `SearchEmptyState` with a working clear control, not the first-run empty state.
- Clearing the search restores the full list.
- Selecting, using, opening the wardrobe for, and deleting an asset all behave exactly as before.
- Both libraries render correctly at 375 px.

### Regression Protection

- These libraries are also opened from inside a Project for selection. Verify that selecting a
  character or outfit from a Project still works, and that an active search does not interfere with
  the selection handoff.
- The delete confirmation and its failure copy must be unchanged.
- Do not regress the overlay's focus management or its close behaviour.

### Validation

Run only:

```bash
bun run --filter @studio/web exec vitest run src/features/account-library src/features/creative-assets
```

Do not run the full test suite or the build.

### Completion Report

State: every file changed; which existing primitives you reused and whether any needed a change; the
matching rule you implemented; how the two empty states are distinguished; confirmation that
selection from within a Project still works; the validation commands and their output; and whether
the store size warrants pagination, with your evidence.
