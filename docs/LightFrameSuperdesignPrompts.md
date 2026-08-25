# Superdesign prompts

**Kind:** design brief. **Not implementation authority** — a brief describes what a redesign must
achieve, never what the product currently guarantees.

Four briefs, one per area where the [UI/UX audit](LightFrameUXAudit.md) concluded that a **new
layout** is needed rather than a fix. Every other finding in that audit is implemented directly
against the existing design system; see the [implementation plan](LightFrameUXImplementationPlan.md).

**All four briefs have shipped**, as items 17–20 of that plan, and every tier of it is now
complete. These pages remain the record of what each redesign was asked to achieve; the plan
records what each one became. A brief is not a description of the product — read the
[feature-behaviour documents](user-flows/feature-behavior/README.md) for that.

## Why only four

| Area                          | Verdict         | Reason                                                                                             |
| ----------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| Local video editor            | **Recommended** | Needs a new spatial model — media dominance, timeline, on-frame manipulation, a real mobile layout |
| Dashboard and first-run       | **Recommended** | A composition problem across four competing blocks, with a first-run versus returning split        |
| Assets and media libraries    | **Recommended** | Structural: tabs, rail sub-navigation, or one filtered surface — real alternatives                 |
| Project workspace save step   | **Recommended** | Redesigning a mental model, with visible layout consequences                                       |
| Studio create                 | Optional        | The CTA pair is right; the rest are direct fixes                                                   |
| Navigation rail               | ~~Optional~~    | **Resolved without exploration** — Settings added no slot and Assets left the compact bar          |
| Take review                   | Optional        | Fewer actions, disclosed details, a mobile sheet — specifiable directly                            |
| Upload and AI transform panel | Not necessary   | Strongest flow already; needs footer hierarchy and one player                                      |
| Page shell and breakpoints    | Not necessary   | Consolidation onto an existing pattern; exploration would add a fifth variant                      |
| Campaigns and Projects lists  | Not necessary   | Fixed by the page shell, overflow menus and one copy fix                                           |
| Colour and tokens             | Not necessary   | The palette is sound. Raise two border tokens to 3:1 and stop                                      |
| Character builder             | Not necessary   | Structure is sound; needs one save decision and a lighter footer                                   |
| Entry screen                  | Not necessary   | Copy, plus one visual                                                                              |

## Shared constraints

Every brief below inherits these. Do not restate them in an answer; do not contradict them.

- **Tokens.** Canvas `#090d12`, raised `#0d131a`, surface `#111922`, strong `#17232f`, soft
  `#0f171f`; border `#293642`, strong `#405363`; text `#f4f7f8`, muted `#b4c0c8`, faint `#7f909d`;
  mint accent `#62e6c2`, strong `#9ff3dc`, soft `#153d37`, on-accent `#041612`; violet `#9b7cff`;
  warning `#ffbf69`; danger `#ff8178`; focus ring `#92ddff`.
- **Type.** Inter for UI, Avenir Next for display. Caption 12, metadata 13, body 14, label 16,
  section 18. No additional typefaces.
- **Spacing** 4 / 8 / 12 / 16 / 24 / 32 / 48. **Radii** 8 / 13 / 19 / pill. **Motion** 120ms quick,
  220ms standard, reduced motion fully honoured.
- **Minimum control size** 44px. Visible cyan focus rings. Keyboard reachable throughout.
- **Breakpoints.** Tablet 40rem, laptop 64rem, desktop 80rem, wide 100rem. Design to these, not to
  the ad-hoc values currently in the code.
- **One mint primary per screen.** Danger colouring is reserved for irreversible actions.
- **Dark only.** There is no light theme and none is being introduced.

---

## Superdesign Prompt — Local Video Editor

You are redesigning the **local video editor** of Lightframe Studio, an existing local-first,
single-operator browser video studio.

### Product Context

Lightframe is a dark, cinematic browser studio for one creator. Everything in this editor runs
**locally in the browser** — no upload, no provider, no cost. It opens over a recorded take or a
saved video and produces an edited video the user then saves. It is reached from the Studio tool
rail (`Edit Video`), from a take review, and from the Videos library. Tokens: canvas `#090d12`,
raised `#0d131a`, surface `#111922`, strong `#17232f`, border `#293642`, text `#f4f7f8`, muted
`#b4c0c8`, mint accent `#62e6c2`, danger `#ff8178`, focus ring `#92ddff`. Inter for UI, Avenir
Next for display. Radii 8/13/19px and pill. Minimum control size 44px.

### Existing Experience

Three columns: a vertical list of five tool buttons (Trim, Crop, Rotate, Lighting, Filters) on the
left; the video preview floating in the centre; a settings inspector on the right containing the
selected tool's controls, undo/redo glyphs, `Preview before`, `Reset all`, `Save edited video` and
`Discard`. `Reset tool` sits alone at the bottom of the left column. On mobile the columns stack:
a ~120px preview, a horizontally scrolling tool row, then the inspector.

### Problems Identified

1. **The video is the smallest element on screen.** At 1440×960 the preview is roughly 500×300
   inside a ~1100px region; the inspector is taller than the video. On mobile it is ~120px tall.
2. **Trim has no timeline.** There is only a mini play bar — no scrubbing, no frame stepping, no
   visible in/out points. You cannot trim to a moment you can see.
3. **Undo and redo are two unlabelled, low-contrast glyphs** in the inspector header.
4. **`Reset tool` is ~600px from the tool it resets.**
5. **`Preview before` is a button, not a comparison** — no hold-to-compare, no split, no shortcut.
6. **Crop and rotate are numeric**, configured in the inspector rather than on the frame.
7. **The mobile tool row truncates** (`Lighting` → `Lig`) with no scroll affordance, and aspect
   options are clipped.

### Primary User Goal

"Make this clip look right and get it out." Trim to the good part, straighten and crop it for a
placement, correct exposure and colour, confirm it looks better than before, and save.

### Redesign Objective

Make the media the subject of the screen and give editing a spatial model: a timeline for time, the
frame itself for geometry, an inspector for parameters, and one labelled group for history.

### Existing Functionality That Must Remain

- Five tools: Trim, Crop, Rotate, Lighting (brightness, contrast, saturation, temperature,
  highlights, shadows), Filters.
- Per-tool reset **and** global `Reset all`.
- Before/after comparison against the unmodified source.
- Explicit terminal actions: `Save edited video` and `Discard` (discard confirms).
- All rendering stays local; degrade gracefully when WebGL/WebCodecs/OffscreenCanvas are missing —
  show the real reason and keep the original shape saveable.
- The dirty state must be visible; nothing is auto-saved.
- Keyboard reachable throughout, 44px minimum targets, visible focus rings, reduced-motion honoured.

### Required UX Changes

1. Media occupies **at least 60%** of the workspace at every breakpoint and grows with the viewport.
2. A **timeline** under the media: thumbnail strip or waveform-height track, playhead, current time
   and duration, draggable in/out handles for Trim, click-to-seek, arrow-key frame stepping.
3. **Direct manipulation on the frame**: crop handles and a rule-of-thirds grid drawn on the media;
   rotate via an on-frame control with 90° snaps.
4. A **labelled history group** adjacent to the media: Undo · Redo · Reset tool · Reset all, with
   text labels or labelled icon buttons and tooltips, never bare glyphs.
5. **Compare** becomes hold-to-compare (pointer and a keyboard binding) with a visible "Original"
   badge while held, plus an optional split view.
6. One **inspector** whose header names the active tool and whose footer holds only that tool's
   reset. Terminal actions live in a persistent action bar, not inside the inspector.
7. **Mobile**: media on top at full width, a compact transport + timeline beneath it, and the
   inspector as a bottom sheet at ~40dvh that can be collapsed to reveal the whole frame. Tools
   become a scrollable segmented row with a visible overflow affordance and no truncated labels.

### Information Hierarchy

Most prominent: the video frame. Then the timeline and transport. Then the active tool's controls.
Then tool selection. Then history controls. Least prominent: capability/format notes. `Save edited
video` is the only mint primary on screen; `Discard` is quiet with a danger-coloured label, not a
filled red block.

### Interaction Requirements

- Selecting a tool never restarts or reloads the media.
- Every parameter change previews live on the frame.
- Trim handles show timecodes while dragging.
- Undo/redo covers every tool and is reflected in the dirty state.
- Escape closes the inspector sheet on mobile without discarding edits.
- Leaving with unsaved edits confirms first.

### Responsive Requirements

- **Desktop ≥80rem**: media + timeline centre, tool rail left, inspector right; media ≥60% width.
- **Laptop 64–80rem**: same, narrower inspector; media never below 55%.
- **Tablet 40–64rem**: media + timeline full width on top; tools as a segmented row; inspector as a
  docked panel beneath, scrollable.
- **Mobile <40rem**: media + transport + timeline on top; tools as a scrollable row; inspector as a
  collapsible bottom sheet; action bar pinned above the app's 4.5rem bottom navigation.

### Visual Direction

Calm, precise, instrument-like. Deep blue-black canvas, layered slate panels, mint reserved for the
one primary action and for active states, cyan focus rings. The frame gets the light; the chrome
recedes.

### Things to Avoid

Gradients behind the media; glassmorphism; decorative cards around controls; more than one mint
button; unlabelled icons; a fifth container radius; any layout where the preview is smaller than
the inspector.

### Deliverable

A complete, implementable design direction for the editor at all four breakpoints: annotated
layouts for each tool's active state (Trim with handles engaged, Crop with on-frame handles,
Lighting with the inspector open), the timeline and transport in detail, the history group, the
compare interaction, empty/unsupported states, and the mobile sheet in both collapsed and expanded
positions. Specify sizes, spacing and states in the existing tokens.

---

## Superdesign Prompt — Dashboard & First-Run

You are redesigning the **Dashboard** (`/dashboard`) of Lightframe Studio, the landing surface of
an existing local-first browser video studio.

### Product Context

One creator, one account. The product's philosophy is that **a video is the unit of work and
organisation is optional**: Projects are for work you will come back to, Campaigns group Projects,
and neither is required to make anything. Dashboard is the first authenticated screen. The
persistent left rail (Dashboard, Studio, Projects, Campaigns, Assets, plus Quick Create, Help,
availability and account) is outside this redesign's scope and must be assumed present. Dark
studio palette; tokens as listed in the editor prompt.

### Existing Experience

A header (`Welcome back, <name>` / `Dashboard` / one-line description) with `Create video`
(primary) and `Browse Assets`; then a two-column body — a left column at `1.5fr` containing a
single "Continue Work" card, and a right column at `1fr` containing "Recent Work" (a merged,
time-sorted list of Projects, Videos and Campaigns with poster thumbnails, an All/Videos/Projects/
Campaigns filter, and three tertiary links: All Projects, All Videos, All Campaigns); then a
one-line explainer about Projects and Campaigns with a "Got it" dismissal; then a full-width
"Processing Queue" section with a Refresh control and per-job abandon.

### Problems Identified

1. **Layout is inverted against content.** The wide column holds one card; the narrow column holds
   the list. On a 1440px screen there is ~350px of dead space under the Continue card.
2. **No page max-width**, so the surface stretches on wide displays while sibling pages cap at 88rem.
3. **The explainer sits below the content it explains.** Users meet "No Campaign" and "Campaign
   Project" labels before being told organisation is optional.
4. **Processing Queue is an operations console on a creative home** — it occupies a full section
   even when idle, and renders a large red block when unavailable.
5. **Weak CTA hierarchy**: `Browse Assets` is a zero-padding quiet button that reads as body text,
   and `Continue Project` is a second mint primary lower on the page.
6. **A brand-new account sees an almost empty page** — one empty Continue card, one empty list, an
   explainer, and an empty queue. It does not answer "what is this and what do I do?"
7. **Bespoke controls**: the Recent filter and the three footer links are hand-styled 10px
   uppercase text rather than the product's `SegmentedControl` and button variants.

### Primary User Goal

Returning: "show me my work and let me get back into it." First-time: "tell me what I can make and
let me start."

### Redesign Objective

One page that answers both, without a mode switch the user has to understand — a genuinely useful
first-run state that becomes a genuinely useful work surface as content appears.

### Existing Functionality That Must Remain

- One unmistakable `Create video` primary.
- Continue Work: the most recently updated active Project with its title, campaign context, updated
  time, and a one-click resume.
- Recent Work: merged Projects + Videos + Campaigns, time-sorted, with poster thumbnails, a
  kind filter, and links to each full collection.
- Per-kind empty states, each with a message, a concrete worked example, and an action.
- Section-scoped loading and error states with per-section Retry.
- The processing queue: live job list, operation and provider names, elapsed time, and abandon with
  its honest cost warning.
- The dismissible, account-scoped organisation explainer.
- `Browse Assets` as a reachable secondary destination.

### Required UX Changes

1. Give the page a **max width** consistent with the rest of the product (`min(100%, 88rem)`,
   centred) and one shared page-header pattern.
2. **Rebalance the columns** so the content that actually has volume gets the width, or move to a
   single column with Continue Work as a full-width resume band above the list.
3. **Move the organisation explainer above the first place container language appears**, shown only
   until dismissed, and only on a first-run-ish state.
4. **Demote the processing queue** to an ambient indicator (a count/badge near the header or in the
   rail) that expands to the full list on demand. Never let an idle or failing queue own a section.
5. **One primary per screen.** `Create video` is mint; `Continue Project` becomes secondary;
   `Browse Assets` becomes a visibly clickable tertiary control.
6. Design a **distinct first-run composition** for an account with zero Projects, zero Videos and
   zero Campaigns: what the product does, what can be made, and one path in. It must use the same
   grid and components, not a separate marketing layout.
7. Replace the bespoke filter and footer links with the product's `SegmentedControl` and a defined
   link-button variant.

### Information Hierarchy

1. What you can make / what to do next (`Create video`).
2. The single most resumable piece of work.
3. Recent work, with previews.
4. Ways into the full collections.
5. Organisation explanation (first-run only).
6. Processing status (ambient unless active).

### Interaction Requirements

- `Create video` goes straight to the creation surface; it must never require choosing a container.
- Every Recent Work row opens its item in one click and preserves scroll on return.
- Filters change the list in place with a polite live count; no layout jump.
- Loading uses skeletons that reserve the final layout, not a text line.
- Errors are per-section with a Retry, never a page-level takeover.
- The explainer dismisses per account and stays re-findable in Help.

### Responsive Requirements

- **Wide ≥100rem**: centred at 88rem; content does not stretch.
- **Desktop 80–100rem**: two columns; the list column gets the greater share.
- **Laptop 64–80rem**: two columns or one, decided at the same breakpoint the rail changes.
- **Tablet 40–64rem**: single column; Continue Work as a full-width band; list below.
- **Mobile <40rem**: single column; the primary action reachable in the first viewport; the header
  must not consume more than about a third of the screen; content clears the 4.5rem bottom nav.

### Visual Direction

Calm, editorial, confident. Dark canvas, restrained surfaces, one mint action, posters carrying the
colour. It should feel like the front page of a working studio, not an analytics dashboard.

### Things to Avoid

KPI tiles; a wall of equal cards; gradients or glassmorphism; a second mint button; large empty
regions caused by an unbalanced grid; a first-run state that is a marketing page rather than the
same product with guidance.

### Deliverable

Annotated layouts at all four breakpoints for three states: **first-run** (nothing exists),
**typical** (a few Projects, Videos and Campaigns), and **active** (a job processing). Include the
loading skeleton, the per-section error, each per-kind empty state, and the ambient-to-expanded
processing interaction. Specify spacing, type scale and states in the existing tokens.

---

## Superdesign Prompt — Assets & Media Libraries

You are redesigning **Assets** and its four libraries in Lightframe Studio, an existing local-first
browser video studio.

### Product Context

Assets holds everything reusable: **Videos** (server-durable saved videos, each with an ordered
list of versions), **Characters** and **Outfits** (stored in this browser only, in IndexedDB, and
lost if site data is cleared), and **Voices** (provider voices the account has kept). Saving to
Assets deliberately does **not** add anything to a Project or Campaign. Dark studio palette and
tokens as listed in the editor prompt.

### Existing Experience

`/assets` is a page containing four cards — Videos, Characters, Outfits, Voices — each showing a
count, a description, a storage note for the browser-local ones, and one `Open <name>` button. Each
button navigates to `/assets/<kind>`, which renders a **fullscreen overlay** on top of the hub;
Escape or the close button returns. The Videos library has search, character and format filters, a
sort control, a result count, a poster grid, per-card `Open in Studio` plus a `…` menu (Edit video,
Use as Project source, Download, Rename, Remove from Assets), and a version-preview dialog.

### Problems Identified

1. **The hub is a menu.** Four cards whose only job is navigation; every library is two clicks from
   the rail. At 320px it is roughly five screens of scrolling.
2. **Download — the reason to visit — is buried** two clicks deep in an overflow menu, while
   `Open in Studio` is the primary on every card.
3. **A permanently disabled `Export` button** ships in the video preview footer with the note
   "Export formats and channels are not specified yet." The product _does_ have export: a
   placement chooser (keep as-is / phone / widescreen / square post / tall feed) already used when
   saving from a Project.
4. **The overflow menu is a raw `<details>`** — it does not close on outside click or Escape and
   has no menu semantics, unlike the header menus elsewhere in the product.
5. **Nothing signals that a library is an overlay**: no breadcrumb, no "Esc returns to Assets".
6. **Inconsistent descriptions** for the same library between the hub card and the overlay header,
   including a raw provider model name ("Lucy 2.5") in one of them.
7. **Data management leads the surface**: the export/import block renders above the Characters and
   Outfits libraries themselves.
8. **Raw values as chips**: the video's internal `origin` and `status` strings render unmapped.

### Primary User Goal

"Find something I made or something I reuse, and use it or take it away." Most often: find a video
and download it.

### Redesign Objective

Collapse the redundant navigation hop, make retrieval the lead action, and give the four libraries
one consistent surface — without losing the overlay behaviour that preserves the user's place.

### Existing Functionality That Must Remain

- All four libraries with their current capabilities.
- Videos: search by title, filter by character and by format, sort, result count, poster grid with
  duration badges, `Generate preview` for videos with no thumbnail, per-video version history with
  preview, Download of an exact version, Rename, Remove, `Use as Project source`, `Open in Studio`,
  `Edit video`.
- Characters: create, copy, open wardrobe, use in Studio; Outfits: create, use.
- Voices: Saved/Browse tabs, preview, keep/remove, send to Studio, plus a clear explanation when the
  provider is not configured.
- Accurate counts that distinguish "none saved" from "not read yet", with a skeleton that reserves
  the count's space.
- Explicit disclosure that Characters and Outfits live in this browser only.
- Library export/import for the browser-local libraries.
- Escape returns to the previous place; a library must never lose the user's scroll position on the
  surface behind it.

### Required UX Changes

1. **Remove the hop.** Either the rail's Assets item opens the last-used library with a persistent
   tab strip across the four, or the hub becomes a single Assets surface with the libraries as tabs.
   One click from the rail to any library.
2. **Retrieval leads.** On a Videos card, `Download` becomes the primary (a split control —
   `Download ▾` with Open in Studio / Edit video — is acceptable). Rename, Remove and Use as source
   stay in an overflow menu.
3. **Resolve Export.** Either wire the existing placement chooser into the video preview so any
   saved video can be re-framed and exported for a destination, or remove the dead control and its
   note entirely. Do not ship a disabled button.
4. **Replace the `<details>` menu** with the product's dismissible popover pattern: outside-click
   close, Escape, `role="menu"`, roving focus.
5. **Signal the overlay**: a persistent header showing where you are and how you leave.
6. **One description per library**, written for a user, with no provider model names anywhere.
7. **Demote portability**: move export/import behind a `…` in the library header.
8. **Map raw values** to readable labels, or remove them.
9. Keep counts, storage disclosure and empty states — surface them in the tab strip and the empty
   state rather than on a card that exists only to be clicked.

### Information Hierarchy

1. Which library you are in, and how to leave.
2. Search and filters.
3. The items, poster-led.
4. Per-item retrieval (`Download`).
5. Per-item secondary actions (overflow).
6. Counts, storage facts, portability.

### Interaction Requirements

- Switching library preserves the surface behind and does not refetch what is cached.
- Filtering and searching update in place with a polite live count; grid height must not jump.
- Loading uses a poster-shaped skeleton grid.
- A broken thumbnail states so and offers `Generate preview`; it never shows a blank tile.
- Version preview opens as a dialog with the version list, the player, and Download for the exact
  version selected.
- Removal always confirms and states what survives.

### Responsive Requirements

- **Desktop ≥80rem**: 3–4 poster columns; filters on one row; tab strip horizontal.
- **Laptop 64–80rem**: 3 columns; filters may wrap to two rows.
- **Tablet 40–64rem**: 2 columns; filters collapse behind a `Filters` control showing an active count.
- **Mobile <40rem**: 1 column; search always visible; filters in a bottom sheet; the primary action
  full-width on each card; content clears the 4.5rem bottom navigation.

### Visual Direction

Poster-led and quiet. The thumbnails carry the colour; chrome is dark and recessive. One mint
action per card. Consistent card radius and border with the rest of the product.

### Things to Avoid

A card whose only content is a button; nested bordered containers; more than one mint control per
card; disabled controls with explanations; provider or model names; raw enum values; a filter bar
taller than the first row of results.

### Deliverable

Annotated layouts at all four breakpoints for: the Videos library (populated, filtered-empty,
fully empty, loading), the version-preview dialog, the Characters library including the
browser-local storage disclosure, the Voices library with its Saved/Browse tabs and its
provider-unavailable state, the library switcher, and the overflow menu. Specify the split-control
behaviour, the skeleton, and every state in the existing tokens.

---

## Superdesign Prompt — Project Workspace: the Save Step

You are redesigning the **Save step** of the Project workspace in Lightframe Studio, an existing
local-first browser video studio.

### Product Context

A **Project** keeps one original video, the AI runs performed on it, the current cut, and the
history of both, so a creator can resume. The workspace is a four-tab inspector — `Original video`,
`Create`, `Save`, `History` — displayed beside the live media stage. Project state autosaves as
server-side revisions with optimistic-concurrency versions and idempotency keys; these mechanics are
correct and must not be weakened. Dark studio palette and tokens as listed in the editor prompt.

### Existing Experience

The workspace masthead shows a back control, the Project title, a workflow progress strip, and a
live save status that reads `Autosaved` / `Autosaving…` / `Not autosaved` (item 11 renamed these
from `All changes saved` / `Saving changes` / `Changes not saved`). The
`Create` tab contains a "Creative setup" panel with its own `Save progress` button. The `Save` tab
offers a placement chooser ("Where is this going?" — keep as-is / phone / widescreen / square post /
tall feed), then `Save as New Video` and `Add Version`, followed by this literal disclaimer:

> "Autosaved" refers to your Project setup. Render preview, Save as New Video and Add Version are
> separate actions you take yourself.

### Problems Identified

1. **Four things are called "save"** on one screen: the autosave status, `Save progress`,
   `Save as New Video`, and `Add Version`.
2. **The product ships an explanation of its own status message.** A disclaimer that a status
   message does not mean what it says is the clearest evidence the model needs restructuring.
3. **The autosave status is still read as “my video is saved.”** Item 11 renamed it to `Autosaved`,
   which no longer says “saved” outright, but a passive indicator beside a Save tab still competes
   with the one action that actually produces a video.
4. **`Save as New Video` and `Add Version` are presented as peers**, forcing a taxonomy decision
   before the user has decided to save at all.
5. **"Version" used to collide with itself.** Item 11 resolved this: duplicating a Project is now
   `Duplicate Project`, and `Version` belongs to Saved Videos alone ("Version 3 · Current").
6. **Confirmation copy is defensive**: "The current cut is now that version. Nothing was copied,
   your original video was not replaced, and no new version was saved." Three negations.
7. **The placement chooser is the best part of this step and is buried below the save buttons.**

### Primary User Goal

"I like how this looks. Give me a video I can use — the right shape for where it's going."

### Redesign Objective

Reduce four save concepts to one deliberate act of saving, plus one ambient indicator that work is
not being lost — without removing any capability.

### Existing Functionality That Must Remain

- Autosaved Project revisions, with a visible indication that unsaved changes exist and a visible
  conflict/error state offering `Reapply changes` and `Discard local changes`.
- The ability to persist the creative setup explicitly (the current `Save progress`).
- Producing a **new** Saved Video, and producing a **new version of an existing** Saved Video.
- The placement chooser with its schematic crop preview and honest degradation when the browser
  cannot re-frame.
- Archived Projects being read-only.
- Optimistic-concurrency conflict handling, with the conflict explained in ordinary language.
- The four-tab structure with arrow-key navigation and `?task=` URL pinning.

### Required UX Changes

1. **One control named "Save".** `Save video` is the only save button in the step, and it produces
   a video file record.
2. **Autosave becomes ambient**: a quiet timestamped indicator (`Autosaved · 2 min ago`) in the
   masthead, in muted type, never adjacent in weight to the save button. Only its _problem_ states
   (conflict, not saved) are allowed to become prominent.
3. **Rename the setup action** away from "save": `Keep this setup` (or equivalent), and place it
   with the setup it belongs to, not as a peer of saving.
4. **Fold new-vs-version into saving.** Pressing `Save video` presents the choice — "As a new
   video" or "As a new version of <existing video>" — with the existing video named, not
   as two buttons the user must classify between beforehand.
5. **Promote the placement chooser** so "where is this going" is answered as part of saving, above
   or alongside the choice, and the schematic crop preview stays visible while choosing.
6. **Delete the disclaimer.** If the design still needs it, the design has not solved the problem.
7. **Rewrite the confirmations positively**: say what happened, not what did not.
8. Never use "version" for a Project anywhere in this workspace.

### Information Hierarchy

1. What you are about to save (a frame or poster of the current cut, and its duration).
2. Where it is going (placement) and the resulting shape.
3. `Save video` — the only mint primary.
4. The new-vs-new-version choice, revealed as part of saving.
5. Autosave status — quiet, ambient, never a peer of (3).
6. Setup persistence and history — adjacent, clearly different in kind.

### Interaction Requirements

- Saving is never automatic and never implied by any status text.
- The save button states its outcome ("Save video · Square post") once a placement is chosen.
- Choosing a placement updates the schematic preview immediately, with no request.
- A conflict blocks saving, explains itself in ordinary language, and offers reapply or discard.
- When re-framing is unsupported in this browser, say so plainly and keep the original shape saveable.
- Success names the result and offers Download and Open, in place — not a redirect the user must
  navigate back from.
- An archived Project shows the same layout in a read-only state that explains why.

### Responsive Requirements

- **Desktop ≥80rem**: the step is an inspector column beside the media stage; the media stays visible
  throughout saving.
- **Laptop 64–80rem**: same, narrower; the placement preview may shrink but must remain legible.
- **Tablet 40–64rem**: the stage sits above and the inspector below; the save action must be
  reachable without losing sight of what is being saved (sticky action bar).
- **Mobile <40rem**: media on top, the step as a scrollable panel, a sticky `Save video` bar above
  the 4.5rem bottom navigation; the new-vs-version choice as a bottom sheet.

### Visual Direction

Quiet and definite. This is the moment the work becomes a thing — one clear action, one clear
result, no ambiguity, no hedging copy. Dark surfaces, one mint action, muted status.

### Things to Avoid

Two buttons containing the word "save"; a status message that could be mistaken for a save receipt;
explanatory paragraphs compensating for ambiguous labels; modal chains; hiding the media while
saving; the word "version" applied to a Project.

### Deliverable

Annotated layouts at all four breakpoints for: the Save step at rest, with a placement chosen, the
new-vs-new-version choice, saving in progress, success, a conflict, an unsupported-browser
degradation, and the archived read-only state. Include the masthead's ambient autosave indicator in
all of its states (autosaved, unsaved changes, saving, conflict, error) and show explicitly how it
is visually subordinate to the save action. Specify all copy.
