## Implementation Prompt — Step 11: Give a Campaign something to do

### Objective

Make a Campaign carry the placements its videos are for, hand them to the Projects inside it, show
what it has produced, and let it adopt an existing Project — so the second video in a Campaign costs
less than the first.

### Context

Lightframe Studio organizes work as **Campaign → Project → Video**. The Project layer is a properly
modelled aggregate with immutable revisions, optimistic concurrency and idempotency receipts.

**The Campaign layer is empty.** The whole table and the whole contract are:

```
{ id, ownerUserId, name, brief, status, version, archivedAt, deletedAt, createdAt, updatedAt }
```

Its only functional relationship to anything is `projects.campaignId`. It carries no target
placements, no channel, no shared creative direction, and shows no aggregate of the videos its
Projects produced. Creating the second Project in a Campaign is exactly as much work as creating the
first.

Two smaller gaps compound it:

- The Campaign surface can start a **new** Project but cannot adopt an **existing** one — even though
  `POST /api/projects/:projectId/campaign` exists and does precisely that.
- The Projects list can filter to "All Active" or "No Campaign", but never to _a_ Campaign.

**This step depends on step 4.** Target placements are meaningless while the placement is not applied
at save time.

### User Problem

The layer that exists to make repeat work cheaper does not make it cheaper.

### Required Behavior

- A Campaign can record one or more target placements, using the same vocabulary as the Project save
  panel.
- A Project created from a Campaign starts with the Campaign's placement already selected, and can
  still change it.
- The Campaign surface lists every video its Projects produced, with posters.
- An existing Project can be attached to a Campaign from the Campaign surface.
- The Projects list can filter to one Campaign.
- Campaigns with no placements behave exactly as they do today.

### Existing Areas to Inspect

Trace the Campaign aggregate end to end before changing its schema.

**Domain and contracts**

- `packages/domain/src/campaigns/` — the rules
- `packages/domain/src/projects/types.ts` — `PROJECT_EXPORT_ASPECTS`, `ProjectExportSpecification`.
  **The Campaign must store these same values, not a parallel vocabulary.**
- `packages/contracts/src/campaigns.ts` — the full contract, including `campaignConflictSchema` and
  its `campaign-not-empty` case

**API**

- `apps/api/src/features/campaigns/` — routes, service, repository
- `apps/api/src/infrastructure/database/schema.ts` — the `campaigns` table, around line 482, with its
  check constraints and partial indexes
- `apps/api/src/infrastructure/database/campaign-repository.ts`
- `apps/api/src/features/projects/routes.ts` — the existing `POST /api/projects/:projectId/campaign`
- `apps/api/src/features/projects/project-output-service.ts` — how outputs relate to Projects, for the
  Campaign-videos view
- `apps/api/drizzle/` — the migration convention. **Never migrate production automatically.**

**Web**

- `apps/web/src/features/campaigns/CampaignRouteSurface.tsx` — the detail and list surfaces
- `apps/web/src/features/projects/ProjectsListSurface.tsx` — `PROJECT_GROUP_OPTIONS`, which currently
  offers only `all` and `none`
- `apps/web/src/features/projects/ProjectDialogs.tsx` — `NewProjectDialog`
- `apps/web/src/features/export-placements/ExportPlacementChooser.tsx` — reuse this chooser
- `apps/web/src/features/projects/WorkPosterTile.tsx` and `projectPosterPresentation.ts` — the poster
  pattern to reuse for the Campaign videos view

### Scope

- Target placements on a Campaign.
- Hand-down to a new Project created from that Campaign.
- A Campaign view of the videos its Projects produced.
- Adopt an existing Project from the Campaign surface.
- Filter the Projects list to one Campaign.

### Out of Scope

- **Brand kits** — colours, fonts, tone, logos, lower-thirds. Explicitly deferred.
- Campaign-level generation, bulk operations, or running work across Projects.
- Deadlines, budgets, owners, or any status beyond the existing lifecycle.
- Changing Campaign lifecycle, CAS semantics, idempotency receipts, or the `campaign-not-empty`
  conflict.
- Changing what a Project does with a placement — step 4 owns that.
- Making the hand-down a constraint. It is a **default**; a Project must remain free to save to a
  different placement.

### UX Requirements

- Placements on a Campaign use `ExportPlacementChooser` and the same language as the Project save
  panel. Do not write new placement wording.
- The Campaign surface should show **what it has produced** above **what it contains** — the output
  is the point.
- Adopting a Project must state that its creative history is unaffected. The Project assets section
  already has the right words for this idea ("Removing an item here never deletes it or this
  Project's history") — match that reassurance.
- A Campaign with no placements must not show an empty or broken section; it should read as a
  Campaign that has not chosen yet, with an obvious way to choose.
- The Projects list filter must apply to **both** the active and archived sections, as the existing
  group filter does — half the screen must not contradict the other half.
- Everything must work at 375 px.

### Technical Requirements

- A schema and contract change, therefore a migration. Follow the existing Drizzle convention in
  `apps/api/drizzle/`. Generate it; do not hand-write it unless generation cannot express it.
- **Keep `expectedVersion` semantics exactly as they are.** Campaign mutations are CAS-guarded and
  receipt-backed; adding a field must not weaken that.
- Add check constraints in the same style as the existing ones (`campaigns_name_length`,
  `campaigns_brief_length`) so the database enforces validity, not only Zod.
- **The Campaign-videos view must not become an N+1.** Derive it from Project outputs in a single
  query, and count to a ceiling (`listTotalSchema` / `exceedsCeiling`) as the rest of the product
  does rather than censusing.
- Adding a route changes `apps/api/src/route-inventory.test.ts` — update the expected list.
- If you add persistence, it must work in every `DATABASE_MODE` the Campaign already supports. Check
  whether both repository implementations are involved and change both if so.
- Reuse `POST /api/projects/:projectId/campaign` for adoption. Do not add a second endpoint that does
  the same thing.

### Acceptance Criteria

- A Campaign can record one or more target placements, and they persist across a reload.
- A Project created from a Campaign opens with the Campaign's placement selected in its save panel.
- That Project can change its placement, and doing so does not alter the Campaign.
- The Campaign surface lists every video produced by its Projects, with posters and a count.
- An existing Project can be attached to a Campaign from the Campaign surface, with copy stating that
  its history is unaffected.
- The Projects list can filter to one Campaign, and the filter applies to both sections.
- A Campaign with no placements behaves exactly as today.
- CAS, idempotency receipts and lifecycle transitions are unchanged.
- The Campaign-videos view issues one query, not one per Project.
- The migration applies cleanly and is reversible.

### Regression Protection

- **A migration on a live table.** Existing Campaigns must keep working with no placements. Test the
  upgrade path with existing rows present.
- The `campaign-not-empty` tombstone conflict must still fire correctly.
- Archive and restore must still work for both Campaigns and their Projects.
- The Dashboard reads campaigns to resolve Project campaign names — do not break that.
- Do not change the Projects list's existing "All Active" / "No Campaign" behaviour when no specific
  Campaign is selected.

### Validation

Run only:

```bash
bun run --filter @studio/api exec vitest run src/features/campaigns src/features/projects src/infrastructure/database
bun run --filter @studio/contracts exec vitest run
bun run --filter @studio/domain exec vitest run
bun run --filter @studio/web exec vitest run src/features/campaigns src/features/projects src/features/dashboard
bun run typecheck
```

Plus Drizzle generation and migration checks. **Never run a production migration.** Do not run the
full E2E or visual suites unless you changed layout, in which case run only the Campaign cases.

### Completion Report

State: every file changed; the exact schema and contract change and the generated migration; how
placements are handed down and why it is a default rather than a constraint; the query behind the
Campaign-videos view and evidence it is not an N+1; how existing Campaigns with no placements behave;
which repository implementations you touched; the route-inventory update; the migration upgrade path
you tested; every validation command and its output; and any acceptance criterion you could not meet.
