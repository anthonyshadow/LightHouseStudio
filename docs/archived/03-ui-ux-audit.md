# UI/UX audit

> **Superseded.** This document describes the interface as it was in August 2026, before the
> [UI/UX audit](../LightFrameUXAudit.md) and its
> [implementation plan](../LightFrameUXImplementationPlan.md) ran to completion across all five
> tiers. Several findings here were fixed by that work, and a few name components that no longer
> exist. Read it as the reasoning that led to that plan, not as a description of the product. For
> current behaviour use [`../user-flows/`](../user-flows/README.md) and the code.

## The one-line finding

The interface is a faithful, careful, well-tested rendering of the domain model — and that is the
problem. Almost every UX defect in this document traces back to the same root: **product concepts
that exist for correctness are shown to the operator as if they were features.**

## Information architecture

**What works.** Four top-level destinations (Dashboard, Projects, Campaigns, Assets) plus Studio is
the right number. The persistent rail is stable. Asset libraries as overlays over their hub keeps
the operator's place. Legacy paths redirect rather than 404.

**What does not.**

| #   | Finding                                                                                                                                                                                                                                                                                 | Evidence                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| IA1 | **Nothing is marked active while in Studio.** `activeDestination` resolves to `'studio'`, which is not one of the four nav ids, so no item receives `aria-current="page"`. The operator loses their place in the primary surface.                                                       | `ShellChrome.tsx`, `StudioHeader.tsx:333` (**N6**)           |
| IA2 | **The Assets hub presents four unequal things as equal.** Videos and Voices are server-durable; Characters and Outfits are browser-local. Videos and Voices show no count; Characters and Outfits show a count read from IndexedDB that silently renders `0` before hydration (**M4**). | `AssetsRouteSurface.tsx:60-160`                              |
| IA3 | **Campaigns occupies a top-level slot it has not earned.** A name and a brief. It gets the same navigational weight as Assets.                                                                                                                                                          | `packages/contracts/src/campaigns.ts`                        |
| IA4 | **"History" is presented as workflow step 4 of 4.** It is a record, not a step.                                                                                                                                                                                                         | `ProjectWorkflowProgress.tsx`, `ProjectRouteSurface.tsx:103` |
| IA5 | **No breadcrumbs outside Project/Campaign detail** (**M5**), and no signpost that `/assets/*` are overlays that Escape closes back to the hub (**M12**).                                                                                                                                | `StudioLibraryOverlays.tsx`                                  |

## Visual hierarchy

**Dashboard.** Reading order is: greeting → onboarding card about organization → **Processing
Queue** → Continue Work → Recent Work. The first two blocks above the fold are an explanation and an
empty queue. The primary creative action is a header button competing with a secondary one.

**Studio create.** On desktop the capture-settings column takes roughly a third of the width
permanently. Nothing about device selection deserves that share of a creative surface.

**Videos library.** Every card carries an identical full-width primary **Open in Studio** button. If
everything is primary, nothing is. Download, rename and remove hide behind a `…` menu; Download —
the thing the operator actually wants — is the hidden one.

**Project overview.** The action row is `Add source` (primary) · `Move Project` · `Rename` ·
`Archive` (danger, red). A red destructive control sits in the default action row of a page whose
job is to start work.

## Cognitive load — the central problem

Terms rendered to the user, verbatim, in the running product:

> `Revision 5` · `immutable Video Version` · `Project provenance` · `working media` ·
> `presented media` · `creative checkpoint` · `Save creative setup` · `Media Asset` ·
> `attached Assets` · `expectedVersion` semantics surfaced as _"Change not applied"_ ·
> **"Unassigned Content — These legacy or independently saved videos have no trustworthy producing
> Project. They remain fully usable; later source reuse records used-by lineage without inventing a
> producer."**

That last one is the **first thing** in the Videos library. It is an accurate statement about
lineage modelling and it is meaningless to anyone who wants to find a video.

The rigour is real and should stay. It should stay _underneath_. The rule to adopt:
**the model may be precise; the label must be ordinary.**

Suggested vocabulary, without changing a single domain type:

| Shown today                          | Shown instead                                                |
| ------------------------------------ | ------------------------------------------------------------ |
| `Revision 5`                         | (remove from the header; keep in History as "5 saved steps") |
| `immutable Video Version`            | `Version 3`                                                  |
| `working media`                      | `current cut`                                                |
| `presented media`                    | `what you're viewing`                                        |
| `Save creative setup` / `checkpoint` | `Save progress`                                              |
| `Project Source`                     | `Original video`                                             |
| `attached Assets`                    | `Used in this project`                                       |
| `Unassigned Content` banner          | delete it                                                    |

## Page density

| Surface           | State                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| Dashboard         | Sparse below the fold; a wide empty column beside Continue Work         |
| Projects list     | Very sparse — one row, then an always-rendered empty "Archived" section |
| Assets hub        | Four cards, then nothing                                                |
| Studio create     | Dense on the right, empty in the middle until media exists              |
| Project workspace | Dense inspector, large empty stage until a source exists                |
| Videos overlay    | Well balanced — the best-composed surface in the product                |

The pattern: **list surfaces are too sparse and configuration surfaces are too dense.** Both come
from the same cause — the space that thumbnails and previews would occupy is filled with text.

## Progressive disclosure

Applied inconsistently. Good: the Project workspace mounts History's three queries only when the tab
opens; the Studio runtime is not fetched on routes without media. Poor: capture settings are always
open on desktop; the "Unassigned Content" explanation is always visible; the Project Assets
disclaimer is always visible; cost warnings render in full before any cost-bearing action.

## Empty states

Every list has one and each has a call to action — this was fixed and it holds. But they are all
**text-and-a-button**. There is no illustration, no example, no preview of what the surface will
look like once populated. The Outfits library still places its create button above the empty state
rather than inside it (**M3**).

## Loading, error and success states

**Strong.** Loading states are `role="status"` with polite live regions. Errors are `StatusNotice`
with `role="alert"`, a real message and a retry. Success is announced. `RouteErrorBoundary`
distinguishes a stale chunk from a crash and offers "Copy diagnostic details" without rendering a
raw error.

**Two gaps.** The Assets hub counts have no loading or error state (**M4**), and the creative
repository has no retry affordance when it fails to open (**M11**).

## Feedback and confirmation

Excellent. `ConfirmationDialog` and the awaitable `useConfirmationRequest` are used consistently;
`window.confirm` appears nowhere. Destructive actions state their consequence, including the honest
_"The configured provider has no verified cancellation API. Provider work and cost may continue
after removal."_

## Onboarding and first use

One dismissible Dashboard card, storing a single boolean per owner
(`dashboardOnboarding.ts`). Once dismissed, **nothing in the product ever explains Projects,
Campaigns or Assets again** (**G8**, **M7**). There is no help, no tour, no glossary, no empty-state
teaching, and no sample content.

Answering the audit's own two questions:

- _Does the interface make it obvious what to do next?_ **On the create path, yes.** Record and
  Upload are unmissable. **Everywhere else, no** — Project overview, the Create tab and the Save tab
  each require knowing the model.
- _Could a first-time user make a usable marketing asset without being taught?_ **They could make a
  video. They could not reliably make the right video for a placement, or find it again.**

## Accessibility

Genuinely good, and tested (`@axe-core/playwright`, `eslint-plugin-jsx-a11y`,
`@storybook/addon-a11y`, `accessibility-responsive.spec.ts` including a 200 %-text reflow case).

Verified in the running application: primary and mobile navs are `display: flex` / `display: none`
per breakpoint, so no duplicate landmark or hidden focusable is exposed; nav items carry text and
`aria-current`; the Project tablist implements roving `tabIndex` with arrow-key movement and
`aria-controls`/`aria-labelledby`; a skip link targets the one shared `<main>`; focus moves to
`<main>` on navigation but is suppressed on cold entry (`location.key !== 'default'`); dialogs take
and return focus to the control that opened them.

Residual risks (not reproduced): keyboard reachability of the crop handles in the video editor, and
screen-reader coherence of the stage's live status region during recording.

## Responsive and mobile

Breakpoints at 22/48/64/80 rem, visual coverage at 1440×960, 1280×720, 834×1112, 390×844 and
320×568, and a documented viewport-bound layout contract where named overlay bodies own scrolling.

The honest limit is stated in [`BROWSER_SUPPORT.md`](../BROWSER_SUPPORT.md): the automated matrix is
Chromium-only and does not validate Safari, touch hardware, safe areas, or the software keyboard.
For a product whose input is a phone camera, **mobile Safari is the least-verified surface and the
most likely real one**.

## Does it feel like a professional creative product?

**Chrome: yes.** The dark theme, spacing, typography, iconography and motion are coherent and
handsome. The Videos library would not look out of place in a commercial product.

**Content: not yet.** A professional creative tool shows you your work. This one describes it.
The gap between the visual craft of the shell and the text-density of what it contains is the single
strongest impression the product leaves.
