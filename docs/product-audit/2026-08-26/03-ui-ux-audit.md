# UI/UX audit

The interface as it actually renders, at desktop (1280×720) and small mobile (375×812), against the
running product.

## Overall judgement

It reads as a **professional creative product**, not a collection of features. Compared with the
first-pass audit, the difference is large and real: ordinary language, posters on every list, search
where it matters, empty states with worked examples, and one consistent icon set at one weight. The
remaining problems are specific, not systemic.

The two questions worth asking continuously:

**Does the interface make it obvious what to do next?** Mostly yes. The Dashboard leads with
"Continue work". Projects carry a 1–2–3 progress model. Save states its placement in the button
label. The one place it fails is the step named Create, which offers no way to create.

**Could a first-time user make a usable marketing asset without being taught?** They could make a
video. They could not be sure it is the right _shape_ — see [02, F11](02-user-flow-audit.md).

## Information architecture

**Working.** Five destinations, one persistent shell, and a Studio capture runtime mounted only on
routes that own live media. Asset libraries are overlays over the current surface rather than pages,
which is a defensible choice and is applied consistently. The compact bottom bar drops Assets to
four destinations because a shelf you open over your work is not a place to stand — a decision the
codebase documents and honours.

**Not working.** The creative tools are not where the model says they are. The Project's step model
is `Original → Create → Save`; the creative tools live behind a bottom-bar button labelled "Edit
Video · Open the video editor", inside an overlay titled "Use existing video" that runs its own
`Source → Edit → Review` wizard. The operator holds two three-step models at once, and the one
named for creating cannot.

## Visual hierarchy and density

- **Dashboard** — good. Welcome, title, two primary actions, "Continue work", "Recent work". The
  hierarchy matches the intent.
- **Projects / Campaigns lists** — clear rows with poster, title, status, timestamp, primary "Open",
  overflow menu. At small collection sizes the search field and group filter consume roughly half
  the viewport above a single row; correct at scale, sparse at one.
- **Project workspace** — the strongest surface in the product. Stage left, task rail right, creative
  tools along the bottom, progress and autosave state in the header. Genuinely good.
- **"Use existing video" overlay** — the weakest. It is `size="workspace"`, occupies almost the
  entire viewport, and stacks a wizard, a media card, a technical-details expander, an edit chooser,
  a provider toggle, a resolution control, a character picker, a reference-image dropzone and a
  submit action. It is a page wearing an overlay's clothes, and it hides the surface that launched
  it.

## Language

Largely fixed, with a specific residue. Still shown to the operator verbatim:

| Where                              | What                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ProjectAssetsSection.tsx:411-413` | `01147510…fb0e1e` above every asset's real name                                                                           |
| Save panel                         | "Project change 37"                                                                                                       |
| Existing-video overlay             | `local-take-20260814T150841Z-ba6ebcb3.mp4`, `reference-da0ec4aa-….jpg`                                                    |
| Character Swap config              | "Decart API" / "Pruna API"                                                                                                |
| Processing status                  | "Looking for a durable current or accepted earlier-revision operation."                                                   |
| Create tab                         | "Picks one exact version of one of your own videos, and never sets a target for Add Version."                             |
| Create tab                         | "This result is for an earlier change. It was kept, but it did not replace what you're viewing and no version was saved." |

The last two are the hardest sentences in the product, and they are on the tab an operator reaches
second.

## States

| State        | Assessment                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Loading      | Good. Skeletons with counts, `role="status"`, per-section rather than whole-page.                    |
| Empty        | Very good. Message, worked example, and an action. An empty archive collapses to one line.           |
| Error        | Good. `StatusNotice` with `role="alert"`, a retry, and no raw provider bodies.                       |
| Success      | Good. Announced politely, and the save moment offers download, "View in Assets", and create-another. |
| Search-empty | Distinct from first-run empty, with a clear affordance.                                              |
| Processing   | Good. Live elapsed timer, queue disclosure that does not close under the operator every 3 s.         |

## Responsive behaviour

Desktop is sound. Small mobile has three confirmed defects, all on the Project workspace.

1. **Fixed action bar occludes panel copy.** At 375×812 the Save panel's paragraph "This frame and
   the selected placement are what the saved video will use." occupies y 632–670. The action bar is
   `position: fixed`, `z-index: 5`, `rgba(9,13,18,0.96)`, y 656–728. Hit-testing at 85 % down the
   paragraph returns the bar. The panel _does_ set `padding-bottom: 104px`, but that only helps at
   the bottom of the innermost scroll — not at intermediate positions.

2. **Three nested scroll regions.** `main#studio-main` (756 px, `overflow-y: auto`, 72 px bottom
   padding for the nav) → `aside` (543 px) → an inner `div` (473 px) holding a 1224 px panel. A
   vertical swipe has ambiguous ownership, and the fixed bar is positioned against the viewport
   rather than against any of them.

3. **Labels break and truncate.** "Campaigns" breaks mid-word to "Campai / gns" in the Dashboard
   filter; "New Character 01" clips to "New Charact" and "Edit · Record or upload a…" truncates in
   the creative tool bar.

A general occlusion sweep of the mobile workspace found **exactly one** occluded element — the one
above. This is a specific defect, not a systemic layout failure.

## Accessibility

Genuinely strong, and better than most products of this size.

- `axe` runs in end-to-end tests across five viewports **and at 200 % text zoom**, including a
  dedicated "small-mobile Project output review reflows at 200 % text" case.
- One `<main>`, a working skip link, `tabIndex={-1}` focus target, and focus moved to `<main>` on
  navigation — but not on cold entry, where stealing focus would be wrong.
- Live regions used with care: `aria-live="polite"` for settled search counts, `role="alert"` for
  failures, and a `VisuallyHidden` alert for the processing-queue error whose visible form collapses
  to an unlabelled glyph below 22 rem.
- The mobile navigation is `display: none` on desktop, so it is genuinely absent from the
  accessibility tree rather than merely invisible.
- Tabs carry proper `role="tab"`, `aria-selected` and `aria-controls`.

**Gap:** navigation is buttons, not links. Every in-app destination is a `<button>` with a
JavaScript `navigate()`; the only `<a href>` in the authenticated application is the skip link.
Assistive technology announces "button" for navigation, and no standard link affordance —
cmd-click, middle-click, copy address, hover preview — works anywhere.

**Note on the test suite:** the occlusion above survived a suite that specifically exercises that
surface at that width. Reflow and overflow assertions do not catch a fixed element painting over
static content; a hit-test assertion would.

## What is too complicated, too sparse, or technically driven

| Problem            | Where                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| Too busy           | The "Use existing video" overlay — nine concerns in one panel                  |
| Technically driven | Provider vendor toggle; resolution before the operator has seen a result       |
| Exposing internals | Asset-card UUIDs, internal filenames, "Project change N", operation vocabulary |
| Too sparse         | Campaign detail — a name, a brief, and two lists                               |
| Redundant          | Two three-step wizards, one nested inside the other                            |

## What to change, in order

1. Condition the privacy claim on the actual persistence mode.
2. Repair the three small-screen defects on the Project workspace.
3. Make the Save panel's promise true, then let its copy stand.
4. Move creation into the Create step and retire the second wizard.
5. Remove the internal identifiers.
6. Replace the vendor toggle with a description of what each engine does.
