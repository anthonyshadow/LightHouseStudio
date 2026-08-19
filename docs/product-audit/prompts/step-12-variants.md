## Implementation Prompt — Step 12: Make another version

### Objective

Let the operator duplicate a Project into a new one that starts from the same source and the same
creative setup, so producing a variation does not mean redoing every step.

### Context

Lightframe Studio is a local-first, single-operator browser video studio for marketing video.
Marketing production is variation: same source, different character; same cut, different placement.
The product supports none of it as a first-class action. There is no duplicate, no branch and no
re-run.

The domain is ready for it. `ProjectRevision` already captures the complete creative intent in
`ProjectSnapshot`: `sourceAssetId`, `workingMedia`, `presentedMedia`, `selectedCharacter`,
`selectedOutfit`, `selectedVoice`, `visualTreatment`, `creativeIntent`, `localEdit` and (after step 11) `exportSpecification`. A duplicate is a new Project whose first revision is derived from an
existing snapshot.

Persistence has **two** implementations that must behave identically:
`apps/api/src/features/projects/file-project-repository.ts` and
`apps/api/src/infrastructure/database/project-repository.ts`.

### User Problem

Producing a second cut means creating a new Project, re-choosing the source, re-selecting the
character, outfit and voice, and paying for a new provider job — every time.

### Required Behavior

- A Project can be duplicated from its overview and from the Projects list.
- The duplicate reuses the same source — **no bytes are copied**.
- The duplicate carries the same creative selections, local edit and export specification.
- The duplicate carries **no** outputs, history, processing state or `lastSuccessfulOutput`.
- Duplicating never starts provider work and never incurs provider cost.
- The duplicate is independently renameable, archivable and deletable.

### Existing Areas to Inspect

- `packages/domain/src/projects/rules.ts` — `createProject`, `createEmptyProjectSnapshot`,
  `validateProjectSnapshot`, `appendProjectRevision`, `deriveProjectStatus`,
  `PROJECT_REVISION_SOURCES`, `projectConflicts`
- `packages/domain/src/projects/types.ts` — `ProjectSnapshot`, `ProjectRevision`,
  `ProjectAssetLink`, `ProjectVersionReferenceLink`, `ProjectAssetMembership`
- `packages/contracts/src/projects.ts` — the create-project request and the project response shapes
- `apps/api/src/features/projects/project-service.ts` and `routes.ts`
- `apps/api/src/features/projects/file-project-repository.ts` — **and** the Drizzle equivalent
- `apps/api/src/features/projects/project-repository.ts` — the repository port and
  `ProjectRetentionPolicy`
- `apps/api/src/infrastructure/database/project-retention-policy.ts` and
  `asset-lifecycle-registry.ts` — how a source asset's lifetime is tracked, which now has to survive
  two Projects referencing it
- `apps/web/src/features/projects/` — the list and overview surfaces from step 6
- `apps/api/src/route-inventory.test.ts` — a new endpoint must be added to the expected inventory

### Scope

- A domain rule that derives a new Project and its first revision from an existing snapshot.
- A new API endpoint to duplicate a Project.
- Implementation in **both** Project repositories.
- A duplicate action on the Project overview and the Projects list.

### Out of Scope

- Batch or multi-variant creation.
- Templates or saved presets.
- Automatic provider re-submission of any kind.
- Copying outputs, revision history, processing jobs or asset memberships beyond what is required to
  make the duplicate usable — and if you believe a membership must be copied, justify it explicitly.
- Cross-Campaign behaviour beyond placing the duplicate where the operator chooses.

### UX Requirements

- Name the duplicate recognisably by default (for example `"<title> (copy)"`), and let the operator
  edit the name before confirming.
- State plainly that no provider work has started and no cost has been incurred.
- Open the duplicate on the step it is ready for, using the existing workspace step derivation.
- Use `ConfirmationDialog` or the existing project dialog pattern; never `window.confirm`.
- Announce the result politely and move focus deliberately, matching how rename and move already
  behave.

### Technical Requirements

- Implement the derivation as a **domain rule**, not in a service or a route handler. It must produce
  a valid snapshot that `validateProjectSnapshot` accepts.
- **Never copy media bytes.** Reuse `sourceAssetId` or the `saved-video-version` reference exactly.
- Clear `lastSuccessfulOutput` and any output linkage. A duplicate has produced nothing.
- Do not carry over processing state — the duplicate's status must derive from its snapshot through
  `deriveProjectStatus`, never be copied.
- Use an appropriate `ProjectRevisionSource` for the first revision. If none of the existing values
  fits, adding one is a contract change — stop and report rather than deciding alone.
- Both repositories must implement it identically. Add a test asserting parity.
- Asset retention must account for two Projects referencing one source: verify that archiving or
  deleting the original does not reclaim bytes the duplicate still needs. **This is the highest-risk
  part of this step.**
- Add the endpoint to `apps/api/src/route-inventory.test.ts`, including its `HEAD` sibling rule if
  applicable.
- The endpoint must take ownership from the verified session subject only, and must respect the
  source Project's `expectedVersion` for optimistic concurrency.

### Acceptance Criteria

1. Duplicating a Project produces a new Project with the same source and the same creative
   selections, local edit and export specification.
2. No media bytes are copied, and the duplicate references the same source asset or saved-video
   version.
3. The duplicate has no outputs, no history beyond its first revision, no processing state and no
   `lastSuccessfulOutput`.
4. Duplicating starts no provider work and incurs no provider cost.
5. Archiving or deleting the original does not make the duplicate's source unavailable.
6. The duplicate is independently renameable, archivable and deletable.
7. The file and Drizzle repositories behave identically, asserted by a test.
8. `apps/api/src/route-inventory.test.ts` passes with the new endpoint listed.

### Regression Protection

- Do not change `createProject`, `appendProjectRevision` or `saveProjectOutput` semantics — add
  alongside them.
- Existing retention and asset-lifecycle tests must pass; extend them for the shared-source case.
- Verify the campaign membership rules still hold: a duplicate placed in an archived Campaign must be
  refused exactly as a move would be.
- Verify `deriveProjectStatus` on the duplicate yields a sensible starting status.

### Validation

```bash
bun run typecheck && npx vitest run packages/domain/src/projects packages/contracts apps/api/src/features/projects apps/api/src/infrastructure apps/api/src/route-inventory.test.ts apps/web/src/features/projects
```

### Completion Report

Report the domain rule added and exactly which snapshot fields it carries and which it clears, the
endpoint and its concurrency handling, both repository implementations and the parity test, how
shared-source retention was verified, the UI entry points, and confirmation that no bytes are copied
and no provider work starts. If you needed a new `ProjectRevisionSource` value, report it as a
contract change requiring review.

### Working rules

Audit the affected area before changing it. Confirm steps 6 and 11 have landed. Read both Project
repositories and the retention policy before writing anything — shared-source lifetime is the part
most likely to break silently. Implement policy in the domain, not in the route handler. Make no
unrelated changes and remove no existing functionality. Do not guess: if the revision-source enum or
the snapshot schema appears to need changing, stop and report. Maintain responsive behaviour,
accessibility and performance. Update the affected documentation and run `bun run check:docs`. Run
only the checks above. Report exactly what changed.
