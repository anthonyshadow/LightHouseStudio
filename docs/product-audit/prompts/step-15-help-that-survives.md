## Implementation Prompt — Step 15: Teach through the product, not through one dismissible card

### Objective

Make the product's core concepts re-learnable after onboarding is dismissed, and turn empty states
into places that teach rather than places that apologise.

### Context

Lightframe Studio is a local-first, single-operator browser video studio.

Its only first-use guidance is a single dismissible Dashboard card:

> **Start with the outcome you need** — Organization is optional. Use **Projects** for focused
> workflows and **Campaigns** to group initiatives.

`apps/web/src/features/dashboard/dashboardOnboarding.ts` stores one boolean per owner. Once
dismissed, **nothing in the product ever explains Projects, Campaigns or Assets again.** There is no
help, no tour, no glossary and no sample content.

Empty states exist on every list and each has a call to action, but they are all text-and-a-button:

- _"No active Projects yet. Create one when resumable context will help."_
- _"No Campaigns yet. They are optional organizers for related Projects."_
- _"No recent work yet. Start with a standalone video and organize it later if needed."_

The Outfits library also places its create button **above** its empty state rather than inside it.

By this point in the roadmap, step 4 has established the product's final vocabulary — the
explanations must use it.

### User Problem

A user who dismissed the card, or who returns after a month, has no way to re-learn when a Project is
worth creating or what each Asset library holds.

### Required Behavior

- A short "How Lightframe works" explanation is reachable at any time from the navigation.
- It answers **when would I use this?** for Projects, Campaigns and each Asset library.
- Each list empty state shows a visual and one concrete worked example.
- The Outfits create button sits inside its empty state.

### Existing Areas to Inspect

- `apps/web/src/features/dashboard/DashboardRouteSurface.tsx` — the onboarding card, the empty-state
  messages and their `emptyAction` mapping
- `apps/web/src/features/dashboard/dashboardOnboarding.ts` — the dismissal boolean and its storage
  failure handling
- `apps/web/src/features/projects/` and `apps/web/src/features/campaigns/` — the list empty states
- `apps/web/src/features/account-library/SavedCreativeLibrary.tsx` — the Outfits empty state and the
  misplaced create button
- `apps/web/src/features/assets/AssetsRouteSurface.tsx` — the hub card descriptions
- `apps/web/src/studio/StudioHeader.tsx` — where a help entry point can live without competing with
  Quick Create
- `apps/web/src/ui/primitives/OverlayPanel.tsx` — the panel to reuse
- `docs/user-flows/README.md` and `docs/user-flows/assets-and-libraries.md` — the accurate
  descriptions to draw on

### Scope

- A static help panel reachable from the navigation, covering Projects, Campaigns and the four Asset
  libraries.
- Enriched empty states across the Projects list, the Campaigns list, the Dashboard recent work and
  the Asset libraries.
- Moving the Outfits create button inside its empty state.

### Out of Scope

- An interactive tour or coach marks.
- Generating sample content.
- Contextual tooltips throughout the product.
- Video or animated help.
- Any new persistence beyond the dismissal boolean that already exists.
- Changing the onboarding card's dismissal behaviour or its storage-failure warning.

### UX Requirements

- Answer **"when would I use this?"**, not "what is this?". A definition is not help.
- Keep the whole explanation to roughly one screen. If it needs scrolling, it is too long.
- Use the vocabulary established in step 4. Do not reintroduce internal terms.
- Empty states should show what the surface will look like once populated — a representative visual,
  not a shrug.
- The help entry point must not compete with Quick Create for prominence.
- Keyboard-operable, correctly labelled, focus returned to the trigger on close, matching how the
  other overlay panels behave.
- Maintain responsive behaviour, including the 200 %-text reflow cases.

### Technical Requirements

- Static content in an existing `OverlayPanel`. No new route, no new persistence, no new query.
- Do not change `dashboardOnboarding.ts`'s storage semantics or its failure warning.
- Empty-state visuals must be inline or already-bundled assets — do not add a network request to
  render an empty state.
- Keep the existing empty-state calls to action working exactly as they do.

### Acceptance Criteria

1. The explanation is reachable from the navigation after the onboarding card has been dismissed.
2. It covers Projects, Campaigns and all four Asset libraries, answering when each is worth using.
3. Each list empty state shows a visual and a concrete example alongside its existing call to action.
4. The Outfits create button sits inside its empty state.
5. No new per-user persistence, route or network request was added.
6. The onboarding card's dismissal and its storage-failure warning are unchanged.
7. Empty states reflow correctly at 320×568 and at 200 % text.

### Regression Protection

- Dashboard, projects, campaigns and account-library tests must pass; extend them for the new
  content.
- Verify every existing empty-state action still triggers the same navigation or dialog.
- Visual baselines that capture empty states will change — regenerate them deliberately and say so.

### Validation

```bash
npx vitest run apps/web/src/features/dashboard apps/web/src/features/projects apps/web/src/features/campaigns apps/web/src/features/account-library apps/web/src/features/assets apps/web/src/studio && bun run check:docs
```

Then, if empty-state visuals changed:

```bash
npx playwright test --config playwright.visual.config.ts && npx playwright test e2e/accessibility-responsive.spec.ts
```

### Completion Report

Report where the help entry point lives and why it does not compete with Quick Create, the concepts
covered and the wording used, every empty state enriched, confirmation that no new persistence or
network request was added, the visual baselines regenerated, and any documentation updated.

### Working rules

Audit the affected area before changing it. Confirm step 4 has landed and use its vocabulary. Reuse
`OverlayPanel` and the existing empty-state components rather than creating new ones. Make no
unrelated changes and remove no existing functionality — every existing empty-state action must keep
working. Do not guess at what a concept means; draw the explanations from the user-flow documentation
and verify them against the code. Maintain responsive behaviour, accessibility and performance.
Update the affected documentation and run `bun run check:docs`. Run only the checks above. Report
exactly what changed.
