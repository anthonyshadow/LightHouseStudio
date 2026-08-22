# Lightframe Studio design system

## Product context

Lightframe Studio is a local-first, single-operator browser video studio. The primary product model
is Dashboard → Create, Assets, Projects, or Campaigns. `/dashboard` is the authenticated Dashboard
and `/studio/create` is the standalone creation workspace; bare `/studio` only redirects to
`/dashboard`. The workspace flow is Record or Upload →
Review → optional Virtual Try On, Character Swap, and/or Voice → Save to Assets or Download. It is a
fixed-viewport workspace with one media stage for as long as the operator is in Studio; tools are
focus-managed overlays and must never remount the media while they are open. Leaving Studio releases
the stage entirely — organization routes mount no media at all. Live AI camera transformation is an explicitly gated Beta flow.
Character Builder creates a reusable Lucy 2.5 character from approachable visual choices, an
optional upload, and an optional paid reference generation. The post-recording editor adopts a
validated upload or normalized local recording as an immutable source, then allows zero or one
visual edit (Character Swap or Virtual Try On) and an optional Voice edit before comparison and
download.

## Information architecture

- Dashboard orients first-time users, exposes one strong Create video action, and helps returning
  users continue recent work.
- Assets exposes retained Videos, Characters, Outfits, and Voices. Recipe is not an Asset type and
  is absent from the UI. Account navigation is reserved for identity, availability, a read-only
  account panel, and logout; a quiet "How Lightframe works" control sits beside it.
- A Campaign optionally groups Projects and never owns media-processing state.
- A Project may intentionally be empty and acts as a collection around one focused, resumable
  primary video workflow today. Its retained outputs and reusable resources are visible from the
  Project overview. Future independently resumable Project children are called **Videos** in the UI
  and **Project Deliverables** in contracts/schema.
- Studio always declares its context, save destination, and return path. Standalone work returns to
  Dashboard or Assets; Project work returns to its Project and then its Campaign when applicable.
- Live AI Beta is hidden from ordinary navigation unless `REALTIME_VIDEO_BETA_ENABLED=true`.
- Saving asks where the video is going — keep as it is, phone, widescreen, square post, tall feed
  post — and re-frames it in the browser before upload. Publishing to a channel does not exist;
  Download continues to retrieve an exact retained Video Version.

## Application shell

- Desktop: Lightframe brand/Home, Dashboard, Projects, Campaigns, Assets, one prominent Create
  action, availability, and Account.
- Dashboard, Projects, Campaigns, Assets, and Project workspaces share the organization shell.
  Desktop and tablet use the existing left navigation rail. Mobile uses the existing compact top
  bar and four-item bottom navigation for Dashboard, Projects, Campaigns, and Assets. Standalone
  Create remains the separate context/exit workspace.
- Every page has one visible page-level `h1`; the brand is a Dashboard link rather than the heading.
- Use one primary action per screen, consistent overflow menus for secondary actions, actionable
  empty states, section-scoped loading/retry, and explicit save destinations.

The post-recording editor must be immediately legible to first-time users: confirm the source,
choose an optional edit, configure only that edit, run it deliberately, then compare and download.
Provider cost/retention disclosure remains clear at the moment of submission without dominating
the local review path.

## Visual character

Keep the existing cinematic dark-studio identity. Use calm, precise hierarchy rather than a
marketing aesthetic. The interface should feel like a dependable creative instrument: deep
blue-black canvas, layered slate surfaces, mint primary actions, restrained violet accents,
high-contrast white text, and visible cyan focus rings.

Do not introduce new fonts, colors, glassmorphism, neon, decorative gradients, or a competing
card/button language.

## Tokens

- Canvas `#090d12`; raised `#0d131a`
- Surface `#111922`; strong `#17232f`; soft `#0f171f`
- Border `#293642`; strong `#405363`
- Text `#f4f7f8`; muted `#b4c0c8`; faint `#7f909d`
- Mint accent `#62e6c2`; strong `#9ff3dc`; soft `#153d37`; on accent `#041612`
- Violet `#9b7cff`; warning `#ffbf69`; danger `#ff8178`; focus `#92ddff`
- Font: Inter/system UI; Avenir Next/system display; no additional typefaces
- Type: 12px caption, 13px metadata, 14px body, 16px label, 18px section
- Spacing: 4, 8, 12, 16, 24, 32, 48px
- Radius: 8px, 13px, 19px, and pill
- Minimum touch control: about 44px
- Quick motion: 120ms; standard: 220ms; fully respect reduced motion

## Character builder UX direction

- Keep one fullscreen `OverlayPanel` and one scroll owner.
- Desktop: orientation rail or compact step overview, spacious editing canvas, and a sticky visual
  summary/preview. Do not shrink the primary preview unpredictably.
- Tablet/mobile: one reading order with a compact sticky progress/review affordance. Do not
  duplicate stateful controls.
- Use progressive disclosure for optional detail. Show a useful starter path before exposing all
  catalog options.
- Make section status scannable: incomplete, selected value, optional, and ready states.
- Keep the primary save action reachable and unambiguous. Reset stays de-emphasized.
- Clearly distinguish “preview is optional” from “character is ready to save.”
- Keep upload and generation as two understandable alternatives, with generation provider/cost
  disclosure close to its action.
- Preserve native semantics, focus trap, Escape/return focus, live status, approximately 44px
  targets, safe areas, 200% reflow, and no document scrolling.

## Post-recording editor UX direction

- Keep the current video visually stable and prominent. The upload-panel player may borrow the
  current artifact URL, but the Studio stage remains mounted and authoritative.
- Present one understandable progression: Source → Edit → Review. Show the current phase and the
  next meaningful action without turning the flow into a rigid wizard.
- Once a source is ready, summarize its technical metadata compactly instead of allowing details
  to compete with editing tools. Replacement and discard remain clearly distinct destructive
  actions with confirmation.
- Treat Character Swap, Virtual Try On, and Voice as scannable tool choices with explicit states:
  available, selected, needs setup, ready, processing, applied, failed, or unavailable.
- Reveal configuration only for the selected tool. Keep saved assets, prompt/reference choices,
  advanced prompt enhancement, URL import, and provider disclosures contextual.
- Keep a single contextual primary action reachable at short heights and on touch screens. Its
  label must state the actual local/provider consequence; never imply a save, submission, retry,
  cancellation, percentage, or provider deletion the runtime does not own.
- During processing, emphasize the immutable accepted plan, current operation, elapsed time,
  cancel/resume boundary, and last healthy video. Hide irrelevant setup chrome without discarding
  editable recovery state.
- In result review, prioritize Original/Result comparison and Download. Start over keeps the
  immutable source; Discard removes source and results after confirmation.
- Desktop uses a stable preview beside a compact planning/configuration column inside the existing
  wide drawer. Tablet and mobile use one reading order with a compact phase header and reachable
  action footer; they are not compressed desktop grids.
- Preserve the shared overlay focus trap, Escape/return focus, one named internal scroller,
  approximately 44px targets, visible focus, reduced motion, safe areas, 200% reflow, and no
  document scrolling.

## Project overview UX direction

- Redesign only `/projects/:projectId`. Keep the existing desktop navigation rail, mobile header,
  and mobile bottom navigation visually and behaviorally unchanged.
- Treat the overview as a calm project home, not a dashboard. Lead with project identity and one
  strong **Continue editing** action. Keep Move, Rename, Archive/Restore, and Delete available but
  visually secondary; destructive actions must not compete with the primary task.
- Replace rounded cards and nested boxes with a flat editorial structure: generous whitespace,
  thin full-width dividers, aligned columns, and restrained changes in surface tone. Avoid a border,
  radius, or shadow around every component. Content thumbnails may remain rectangular media frames.
- Keep only purposeful copy. Metadata should scan as a compact line and the source/workspace
  explanation should communicate the next action without repeating ownership or retention policy.
- Project Assets remain a separate non-owning collection with All, Videos, Characters, Outfits,
  and Voices filters, Add Asset, preview/open/detach actions, missing-resource state, bounded load
  more, and archived read-only behavior. Make the collection easy to scan without enclosing every
  asset in a rounded card.
- Desktop may use a compact project summary column beside the larger Assets collection. Tablet and
  mobile switch to one logical reading order. At narrow widths, controls wrap or stack without
  horizontal overflow; the primary action remains easy to reach and touch targets stay about 44px.
- Preserve every existing dialog, route, API contract, focus behavior, live announcement, and
  empty/loading/error state. The redesign changes presentation and information hierarchy only.

## Project workspace UX direction

- `/projects/:projectId/workspace` uses the same organization shell as Dashboard, Projects, and
  Campaigns: the exact existing left navigation rail at widths of 48rem and above, and the exact
  existing compact mobile header plus four-item bottom navigation below 48rem. Projects remains the
  active destination. Do not create a second or workspace-specific navigation system.
- Keep the one media stage mounted and visibly framed at every supported viewport in Studio. The
  video must never collapse to zero height, disappear behind the Project panel, or be obscured by
  the mobile bottom navigation.
- At 1440x960 and 1280x720, the video stage remains dominant beside a compact Project workflow
  inspector. At 834x1112, keep the left rail and stack a 16:9 video stage above the workflow. At
  390x844 and 320x568, keep the compact top bar and bottom navigation, render a full-width 16:9
  stage above the workflow, and reserve bottom safe-area space so both video and controls remain
  reachable without horizontal overflow.
- Preserve the current source, creative checkpoint, working-media, processing recovery, output
  save, and bounded history contracts. Responsive presentation may reorder or progressively
  disclose their views, but it must not duplicate stateful controls or invent actions.

## Responsive contract

Design explicitly for `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`.
At short heights, header/footer remain compact and the named body region scrolls. At narrow widths,
buttons may stack, labels may wrap, and option cards use two columns without horizontal overflow.
The sole high-consequence save action must remain visible.
