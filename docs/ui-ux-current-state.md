# UI/UX Current State

Date: 2026-07-28  
Applies to: the current single-route Lightframe Studio at `/`  
Release frame: touch/mobile-inclusive, operator-assisted, loopback-only controlled pilot

This document records implemented UI behavior, source-confirmed defects, UX risks, and unresolved manual/device questions. It does not redefine planned work as implemented. Public or remotely hosted use is a separate product and security category.

Evidence labels:

- **Code-confirmed:** directly established by current source, contracts, tests, or checked-in visual evidence.
- **Visually observed:** present in reviewed screenshot baselines or audit captures.
- **Manual/device unknown:** requires a physical device, assistive technology, live provider, or user study.
- **Recommendation:** proposed behavior; not current implementation.

## 1. Executive summary

Lightframe Studio has a strong interaction foundation: one persistent media stage, one shared overlay system, explicit local/provider starts, contextual stage notices, safe recording finalization, and unusually complete character prompt/image/combined flows. The application is coherent as a single-operator creative camera studio, but its required touch/mobile pilot experience is not yet release-ready.

Three areas prevent an unqualified MVP-readiness claim:

1. **Manual/device unknown:** the code now restores timed-out live/playback controls from
   stage-owned pointer, touch, focus, and keyboard activity, and recording Stop never auto-hides.
   The named physical touch/browser matrix and assistive-technology protocol have not passed.
2. **Code-confirmed:** every direct Start now states the Decart 300-second maximum, but the
   authoritative constraint, elapsed/remaining state, warning, and expected-expiry recovery are
   not yet carried through the browser session lifecycle.
3. **Code-confirmed risk:** recording is memory-buffered and does not enforce the approved
   300-second maximum. The cap and physical-device evidence are still missing.

For the controlled pilot, retain the single-stage architecture, lead with local preview and reusable Character Transformation, keep the included VTO experience secondary/beta and Workshop advanced, add incremental action-first descriptions instead of mechanically renaming the IA, and keep deployment loopback-only. Touch/mobile recovery and physical-device usability are unconditional stop-ship issues. Authentication, tenancy, billing, and public deployment controls are not controlled-pilot UI work, but they block any remote/public release.

## 2. Current experience overview

The user enters directly into a fixed Studio shell:

1. Header: brand, selected-character control, and integration summary.
2. Main stage: idle privacy copy, live local/provider media, finalization, playback, recording state, and contextual notices.
3. Session controls: camera/microphone, AI start/stop/change, recording, session close, and take actions.
4. Capture summary/settings entry below the stage.
5. Persistent creative rail: Dock, Take, Workshop, Shelf.
6. Overlays: right drawers, bottom sheets, or full-screen mobile dialogs layered over the still-mounted stage.

The primary product loop is understandable after it has been learned:

> prepare or select a character → start local camera → explicitly start Character AI → record → review/playback → optionally treat voice → download

The first-use presentation is less clear. Start Camera, Character, Dock, Take, Workshop, Shelf, and integration details appear before the user is shown that sequence. This is a progressive-disclosure and terminology issue, not a reason to add another route or a parallel media workspace.

## 3. Current information architecture

| Level            | Surfaces                                                                  | Current purpose                                                                 | Assessment                                                         |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Persistent shell | Header, Media Stage, session controls, capture summary, tool rail         | Keep the user in one creative workspace                                         | Strong                                                             |
| Session setup    | Recipe Dock: Local Camera, Character, Virtual Try-On                      | Prepare and start the active session                                            | Complete, but “Dock” needs action-first explanation                |
| Creation         | Character Builder, Prompt Workshop                                        | Create a reusable character or one structured visual change                     | Powerful; Builder is primary, Workshop is advanced                 |
| Reuse            | Character selector, Recipe Shelf: Saved/Recent/Characters                 | Select, search, edit, rename, delete, and reuse browser-local work              | Strong model; both saved-character entries honor Characters intent |
| Capture          | Capture Settings, session controls                                        | Choose devices/quality and operate live media                                   | Clear and appropriately separate                                   |
| Take             | Stage playback, Take Review                                               | Download, voice-treat, close/release, or discard the current take               | Strong preservation model                                          |
| Voice            | Local treatments, ElevenLabs Voice Browser                                | Process immutable original audio locally or through an explicit provider action | Trustworthy but nested and copy-dense                              |
| Recovery         | Stage notices, missing-reference recovery, confirmations, Legacy Projects | Recover without replacing the primary workspace                                 | Generally strong                                                   |

### Terminology direction

Do not mechanically rename every surface before pilot evidence. In particular, `Dock → AI Setup` is misleading because Dock also owns Local Camera. Use incremental descriptions:

- **Dock · Set up camera or AI**
- **Shelf · Reuse saved work**
- **Workshop · Build one visual change**

Use plain verbs in first-success guidance: Start camera, choose a character, set up Virtual Try-On,
browse saved characters. The implemented **Studio available to try / Studio limited** summary and
configured/not-configured details deliberately describe configuration rather than health,
reachability, quota, or entitlement.

## 4. Primary user journeys

| Journey                   | Current steps                                                               | Current-state assessment                                                                 |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Local preview             | `/` → Start Camera + Mic, or Dock → Local Camera → Start local preview      | Explicit, provider-free, and the best first success                                      |
| Prompt-only character     | Character selector → Create → choose direction → optionally generate → Save | Complete and well covered                                                                |
| Image-only character      | Builder → upload → Save & Use Image Only                                    | Strong provider-independent fallback                                                     |
| Combined character        | Upload + direction → Generate Combined Preview → Save                       | Clear source/result and stale-preview behavior                                           |
| Select saved character    | Header/AI chooser → Choose saved character → Shelf → Characters → Use       | Complete; one-shot intent reaches Characters without a second picker                     |
| Character AI              | Start camera → Start AI → Start with selected character                     | Direct transfer/usage/maximum/Stop disclosure is present; live cap state remains missing |
| Direct Character recipe   | Dock → Character → prompt/image/enhance → Start/Apply/Revert/Reset          | Complete expert path; overlaps with guided Builder                                       |
| Virtual Try-On            | Start AI/Dock → VTO → prompt/image/both → Start                             | Functional; should be secondary/beta and not imply fit/size prediction                   |
| Structured prompt         | Workshop → Add/Replace/Restyle → use or save                                | Clear advanced task                                                                      |
| Record                    | Live stage → Record → Stop → Finalizing                                     | Strong lifecycle; narrow controls are crowded; safe duration unknown                     |
| Review                    | Playback replaces live stage → Download/Voice/Close/Discard                 | Correct media continuity and data-loss protection                                        |
| Local voice               | Review → Voice → Warm/Clear/Robot → process/use                             | Clear and provider-free                                                                  |
| ElevenLabs voice          | Voice → explicit contacts-provider action → browse/preview/apply            | Strong disclosure; nested and cognitively dense                                          |
| Permission/error recovery | Failed action → stage alert → retry/settings                                | Errors remain where work occurs without resizing the stage                               |
| Legacy entry              | Retired/project URL → canonical `/` + Legacy Projects                       | Correct compatibility-only behavior                                                      |

## 5. Surface-by-surface review

| Surface               | Hierarchy, feedback, and states                                                           | Overlay/stage behavior                                      | Main issue                                                           |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Header                | Selected character is a useful return anchor; integration details are collapsible         | Persistent and compact                                      | Configuration language is truthful; active health belongs to session |
| Media Stage           | Clear idle/live/provider/playback/finalizing states; contextual alerts; contain-fit media | Persistent; not remounted by drawers                        | Physical-device media quality remains manual                         |
| Session control bar   | Keeps primary live controls on the stage; recording collapses to dominant Stop            | Auto-hides during live/playback; stage activity restores it | Physical touch/assistive-technology evidence pending                 |
| Recording controls    | Source/device summary and settings entry                                                  | Does not replace stage                                      | Good                                                                 |
| Character selector    | Selected/none state, create/edit/choose                                                   | Right drawer; mobile full-screen                            | Saved-character action lands in wrong category                       |
| AI chooser            | Clear Character versus VTO choice                                                         | Full-screen while local media remains active                | Missing direct provider/session disclosure; VTO wording is technical |
| Recipe Dock           | Complete prepare/apply/revert/reset/start/stop states                                     | Drawer/full-screen mobile; stage remains mounted            | Expert density and metaphor learning                                 |
| Capture Settings      | Devices, quality, active/provider-managed state                                           | Internal scrolling; responsive drawer                       | Good                                                                 |
| Prompt Workshop       | Constrained Add/Replace/Restyle authoring                                                 | Wide drawer → tablet bottom → mobile full-screen            | Secondary tool has equal rail weight                                 |
| Recipe Shelf          | Saved/Recent/Characters, search/tags, use/edit/rename/delete                              | Bottom sheet/full-screen mobile                             | Entry intent and category taxonomy                                   |
| Character Builder     | Upload, presentation, choices, constraints, generation, save                              | Full-screen; desktop sticky preview                         | Mobile preview/generate follows every form section                   |
| Builder confirmations | Name, regenerate, reset, discard                                                          | Topmost nested dialogs                                      | Good destructive protection                                          |
| Take Review           | Playback metadata and actions                                                             | Bottom sheet while playback remains in stage                | Release wording after download can be clearer                        |
| Voice Treatments      | Local choices, progress, cancellation, errors                                             | Bottom sheet over playback                                  | Technical compatibility copy is dense                                |
| Voice Browser         | Explicit provider contact, loading/search/empty/error/paging                              | Nested right drawer                                         | Deep layer stack; usage context can improve                          |
| Stage notices         | Permission/provider/recording/sidecar recovery                                            | Overlay within stable stage                                 | Good                                                                 |
| Legacy Projects       | Compatibility recovery only                                                               | Full-screen                                                 | Keep out of primary IA                                               |

## 6. Responsive review

### Desktop

**Code-confirmed strengths**

- The stage remains the visual center.
- Wide drawers preserve context rather than navigating away.
- Character Builder uses a two-column layout with a sticky preview.
- Pointer, touch, focus, and keyboard activity restore auto-hidden controls through the persistent
  stage boundary.

**Risks**

- The equal-weight tool rail competes with the primary loop for first-time users.
- Nested Voice/Treatment surfaces can become dense.

### Compact desktop, 1280 × 720

The fixed shell and wide overlays have explicit compact-height treatment. This viewport is correctly retained as a core visual target because vertical space, not just width, changes hierarchy.

### Tablet, 834 × 1112

Wide right drawers become bottom panels while standard drawers remain narrower. The stage remains mounted. Functional geometry coverage exists, but physical tablet touch/media behavior is a **manual/device unknown**.

### Mobile, 390 × 844 and small mobile, 320 × 568

**Code-confirmed behavior**

- Overlay panels become full-screen.
- Safe-area insets and internal scrolling are used.
- Builder collapses to one column and places preview/generation after the final configuration section.
- The persistent stage owns pointer/touch/focus recovery outside the control subtree; recording
  suspends auto-hide and exposes only Stop.

**Visually observed risks**

- The recording state is now a single Stop action; its updated Darwin/Linux baselines are reviewed,
  while named physical-device rendering still requires qualification.
- Full-screen tools completely cover the stage, which is expected, but the close action and task context must remain obvious.

**Release position**

Touch/mobile creation is required for the controlled pilot. Control recovery is implemented and
automated at the canonical viewports, but the named device/browser matrix must still pass before
support is claimed. Responsive screenshots do not prove camera, recording, remux, memory, battery,
or background/foreground support on a real mobile browser.

## 7. Accessibility review

### Code-confirmed strengths

- Skip-to-main link.
- Shared dialogs with modal semantics, labelled heading/description, focus trap, topmost Escape handling, and focus restoration.
- `aria-hidden` plus `inert` for invisible session controls.
- Pressed/expanded/current states on relevant controls.
- Visible focus styles and generally 2.75rem minimum interactive heights.
- Reduced-motion behavior in overlays and reduced-motion visual-test setup.
- Safe-area padding, internal scroll ownership, and document-overflow checks.
- Axe checks across all five viewports for the preparation/Workshop path.

### Code-confirmed control recovery

`MediaStage` owns one three-second timer and stage-bound pointer, touch, and focus listeners;
keyboard activity is handled by the same owner. The hidden control subtree remains correctly
`aria-hidden`/`inert`, while recording bypasses auto-hide and `StudioSessionControlBar` enforces a
visible dominant Stop action. Component and touch-context E2E coverage verify those outcomes.

### Manual/device unknowns

- VoiceOver, TalkBack, and NVDA announcements for finalization, optimization/generation, recording, and voice processing.
- Touch recovery on physical iOS/Android/tablet devices after a fix.
- 200% text/zoom, text-spacing overrides, and long/pseudo-localized labels across dynamic overlays.
- Contrast of disabled states, focus rings, text over live video, warnings, and scrimmed surfaces under real rendering.
- WebKit camera/record/playback/remux behavior.

Automated axe results do not settle those questions.

## 8. Strongest design decisions

1. One persistent `MediaStage` and video element own idle, live, provider, finalizing, and playback presentation.
2. Shared `OverlayPanel` preserves context, stage dimensions, keyboard behavior, and responsive rules.
3. One active Studio overlay prevents competing feature-specific modal systems.
4. Camera/provider work begins only from explicit actions; Local Camera remains independent.
5. Playback replaces live video after finalization while the stage dimensions remain stable.
6. Take finalization and immutable-original voice rules protect user media.
7. Character prompt-only, upload-only, and combined flows have explicit generation, stale, unavailable, and recovery states.
8. Errors and warnings appear on the stage or owning panel instead of changing the page layout.
9. Destructive/dirty-state actions use confirmations and focus-safe nested dialogs.
10. Deterministic media/network test seams make meaningful responsive and visual coverage possible.

## 9. Weakest design decisions

1. Physical-device and assistive-technology qualification still trails the now input-agnostic
   stage activity implementation.
2. Shelf category state is generic even when the entry action explicitly asks for a character.
3. The direct primary AI Start decision omits the fuller provider trust contract.
4. The enforced AI-session limit is invisible.
5. First-run surfaces expose expert tools and metaphor vocabulary before the core loop is established.
6. Character Builder prioritizes source order over narrow-screen generate/review access.
7. Recording now focuses a sole high-consequence Stop state, but physical-device evidence remains
   pending.
8. Retained reference bytes and browser-level detach/delete are not distinguished close enough to the action.
9. Recording duration support is not a visible or evidence-backed product contract.

## 10. Inconsistencies

- VTO is visually equal to Character Transformation despite weaker persistence and a secondary/beta product role.
- Builder calls an uploaded asset immutable/local while “Remove” can be interpreted as byte deletion even though it only detaches.
- Recording actions are locked, but their disabled buttons remain visually prominent.
- The prior curated `idle` screenshot opened Recipe Dock, so its name and visual state disagreed.
- The prior `character-live` screenshot used a direct prompt with no selected character.
- The prior small-mobile Take Review screenshot captured a lazy fallback instead of review content.

## 11. Friction points

- Learning Dock, Shelf, Workshop, recipe, working draft, applied recipe, Character, and VTO before first success.
- Choosing Character AI through multiple overlapping preparation paths.
- Discovering that saved characters live under a separate Shelf category.
- Scrolling through the complete mobile Builder before reaching preview/generation.
- Confirming timed-out control recovery on each named physical touch/browser target.
- Distinguishing configured integration from currently connected provider.
- Understanding when external usage begins and when the five-minute session will end.
- Understanding that upload removal or character deletion does not erase immutable local bytes.
- Navigating Take Review → Voice Treatments → Voice Browser while playback remains active.
- Knowing how long a recording is supported before memory risk.

## 12. Missing states

### Missing in the current UI

- AI-session authoritative constraint handoff, elapsed/remaining state, near-expiry warning, and
  expected-limit completion (the direct Start copy already states 300 seconds).
- Evidence-backed recording maximum and, if required, safe automatic finalization warning.
- Clear detach-versus-delete retained-asset consequences.
- Contextual disabled/unavailable reasons in the AI chooser.
- A compact narrow-screen Builder review/generate affordance.
- A lightweight first-success path for unassisted use.

### Missing release evidence

- Physical target recording-memory results.
- Real touch control recovery.
- Real assistive-technology pass across dynamic states.
- Live entitlement/quality smoke for every exposed provider/model.
- Confirmed provider retention and zero-retention account behavior.
- User evidence for terminology and onboarding.
- Expected AI-cap behavior while a provider-source recording is active.

## 13. Recommended improvements

Priority meanings: **P0** blocks the stated release condition; **P1** is recommended before unassisted MVP; **P2** is post-MVP refinement. Effort is XS/S/M/L. Risk is implementation regression risk.

| ID     | Problem                                                                                                   | User impact                                                                         | Evidence                                                                                  | Recommendation                                                                                                                                                                   | Priority                                 | Effort              | Risk              | MVP classification                                             |
| ------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------- | ----------------- | -------------------------------------------------------------- |
| UX-001 | Runtime input recovery is implemented; physical touch/browser/assistive evidence is pending               | An unqualified target could still fail the critical session/take actions            | `MediaStage` timer/listeners; control-bar invariant; component/mobile E2E                 | Run the real timeout/recovery/Stop protocol on every named physical target and retain content-free evidence                                                                      | P0                                       | S                   | Medium            | Unconditional controlled-MVP stop-ship until physical evidence |
| UX-002 | **Implemented:** saved-character actions consume one-shot Characters intent                               | Users reach the promised collection without a second picker                         | Studio/Shelf controller plus complete header/chooser Use→Start browser journey            | Preserve consumable intent, dirty-form confirmation, and non-persisted navigation semantics                                                                                      | Complete runtime/automated               | S–M                 | Low               | Physical release evidence tracked separately                   |
| UX-003 | Mobile Builder preview/generate appears after every form section                                          | Generation and result feedback are hard to discover                                 | `CharacterBuilderForm.tsx:146-299`; responsive test codifies preview-last                 | Keep one DOM; add anchored Review & Generate/compact status or a Configure → Review step; verify 320/tablet/200% text                                                            | P1                                       | M                   | Medium            | Before touch/unassisted MVP                                    |
| UX-004 | First entry exposes expert tools without a primary sequence                                               | Higher time-to-first-preview/download and support dependency                        | Studio shell/tool rail; no onboarding state                                               | For moderated pilot use task guidance; before unassisted use add dismissible in-context first-success guidance, not a new route/tour                                             | P1                                       | M                   | Low–Medium        | Pilot-measure, then MVP                                        |
| UX-005 | Metaphor and state vocabulary overlap                                                                     | Users must learn product jargon before success                                      | Dock/Shelf/Workshop/recipe/draft/applied copy                                             | Add action-first subtitles and plain verbs; test labels before wholesale rename                                                                                                  | P1                                       | S–M                 | Low               | Incremental before MVP                                         |
| UX-006 | Recording now collapses to Stop; broader long-label/reflow and physical evidence is pending               | Unqualified text/device combinations could still compromise reachability            | Control-bar rendering; 200%-text mobile E2E; reviewed Darwin/Linux baselines              | Finish physical long-label, safe-area, and 200% checks                                                                                                                           | P1                                       | S                   | Low               | Before mobile/unassisted MVP                                   |
| UX-007 | Header configuration truth is implemented; chooser contextual availability remains                        | Users no longer read configuration as health but may enter unavailable branches     | Header derivation/tests; chooser still receives no availability                           | Preserve configured/limited/available-to-try language; add unavailable-card reasons in the later usability wave                                                                  | P1 remaining chooser work                | S                   | Low               | Before unassisted MVP                                          |
| UX-008 | Voice workflow nests dense technical/provider copy                                                        | Users lose context and cannot predict local/provider work                           | Voice Treatments and Voice Browser surfaces                                               | Keep trust disclosure; move compatibility details behind help; strengthen breadcrumb and one-line outcome/usage context                                                          | P1                                       | M                   | Medium            | Required because Voice/ElevenLabs are included                 |
| UX-009 | Post-download Close does not explain temporary-artifact release                                           | Users may not understand what Close removes                                         | Take Review actions/copy                                                                  | Keep the safety gate; use “Close and release” or equivalent post-download copy; retain confirmed Discard                                                                         | P2                                       | XS–S                | Low               | Post-MVP refinement                                            |
| UX-010 | Simplification could create parallel routes/media/modal/storage systems                                   | Fixes could damage the strongest architecture                                       | `StudioApp`, `MediaStage`, `OverlayPanel`, repositories                                   | Treat one stage, one route, shared overlays, and existing repositories as design constraints                                                                                     | Constraint                               | N/A                 | High if ignored   | Always                                                         |
| UX-011 | **Implemented:** direct Character/VTO and Dock Starts share Decart disclosure                             | External transfer, usage, 300-second maximum, and Stop are visible                  | Shared `DecartStartDisclosure` component and chooser/Dock tests                           | Preserve the single copy source; do not replace it with a recurring modal                                                                                                        | Complete runtime/automated               | S                   | Low               | Live qualification remains separate                            |
| UX-012 | **Implemented:** five-minute AI maximum, elapsed/remaining timer, static warning, and expected completion | Users can plan around the boundary; expected expiry preserves local fallback/recipe | Stage timer/status, session clock, warning, controller/browser ordering tests             | Preserve the independent clock, non-chattering warning, early-end distinction, and finalize-before-release behavior; complete paid live/physical qualification                   | Complete runtime/automated; live pending | M                   | Medium            | Live evidence required before AI pilot                         |
| UX-013 | Detach/delete UI does not erase immutable local reference bytes                                           | Personal images may remain contrary to user expectation                             | Asset store/privacy docs; no ordinary delete route                                        | Pilot: disclose at upload/detach/delete, isolate data directories, verify operator cleanup. Later add coherent erase-all/relationship-aware deletion, not unsafe orphan deletion | P0 disclosure; later deletion P1/public  | S–M pilot; L public | High for deletion | Disclosure/cleanup required; full manager deferred             |
| UX-014 | **Runtime implemented:** physical 300-second support evidence remains                                     | An unqualified target may still exhaust memory or fail codec/finalization           | Independent 270/300 policy, warning/completion notices, cap race tests; no target results | Preserve coalesced automatic Stop/finalize and measure finalization, local/ElevenLabs voice, interruption, download, and cleanup on every named target                           | Runtime/automated complete; evidence P0  | M                   | Medium            | Required before controlled MVP                                 |

## 14. Priority ranking

### Controlled-pilot Gate 0: scope decisions

1. Named desktop and touch/mobile browser/device matrix; loopback-only remains fixed.
2. Operator-assisted versus unassisted cohort.
3. Pilot storage isolation/cleanup promise.
4. External-participant provider settings/content/refusal/support policy.
5. Live-smoke credential, billing authorization, evidence, and escalation owner.

### Required before external controlled pilot

1. UX-002 saved-character intent.
2. UX-011 direct provider consent.
3. UX-012 visible AI-session limit and expected recovery.
4. UX-013 retained-asset disclosure and verified cleanup.
5. UX-014 supported-duration evidence/policy.
6. UX-001 touch/mobile recovery and physical-device evidence.

### Recommended before unassisted MVP

UX-003, UX-004, UX-005, UX-006, UX-007, dynamic accessibility/manual evidence, and truthful screenshot release coverage.

### Post-MVP or conditional

UX-009 remains post-MVP. VTO and Voice are included, so their comprehension, trust, and responsive
polish are P1 release work rather than conditional.

### Public-release split

Authentication, authorization, tenancy, rate/entitlement controls, public deletion/retention, deployment CSP/TLS/secrets, moderation operations, public observability, and support are absolute public blockers but not UI work for the loopback controlled pilot.

## 15. Suggested future experience

The future Studio should remain one route and one stage:

1. Idle stage gives one clear primary action: Start Camera + Mic.
2. A small, dismissible first-success guide names the sequence without blocking experts.
3. Character selector offers Create, Continue with recent, and Browse saved; Browse opens Characters directly.
4. Start AI opens a chooser with Character primary, VTO secondary/beta, contextual capability state, provider disclosure, and the session maximum.
5. Character Builder keeps the desktop sidecar and gives narrow screens an explicit Configure → Review & Generate progression.
6. Live stage shows compact recording elapsed/remaining and secondary AI-session remaining without crowding controls.
7. Touch/pointer/focus/keyboard activity reliably reveals controls; Stop Recording never
   disappears.
8. Playback remains on the same stage; Take Review makes Download, Voice, Close/release, and Discard consequences unambiguous.
9. Local storage and provider contact are disclosed at the action that creates them, with details available but not repeated as modal friction.

## 16. Open design decisions

- Is the first cohort operator-assisted or expected to self-activate?
- Which exact phone, tablet, touch-capable desktop, browser, and OS versions form the support matrix?
- At AI cap while recording provider output, does the take finalize immediately or follow another explicit transition?
- Which OpenAI/BFL/Wiro settings and external-participant content/refusal/support policy are approved?
- Who owns provider credentials, billing authorization, live-smoke evidence, and escalation?
- Should `Shelf` become `Library` after testing, or retain its metaphor with a subtitle?
- What retention, detach, deletion, isolation, and whole-dataset cleanup promise applies to pilot references?
- What minimal content-free diagnostic evidence can the pilot collect without violating local-first expectations?

## 17. Screenshot references

The current intended 29-case matrix is documented in [screenshot-test-coverage.md](./screenshot-test-coverage.md) and defined by `e2e/studioVisualMatrix.ts`.

High-value references:

- `screenshots/<platform>/01-full-desktop-1440x960/01-studio/initial-closed.png`
- `screenshots/<platform>/05-small-mobile-320x568/01-studio/recording-active.png`
- `screenshots/<platform>/01-full-desktop-1440x960/01-studio/selected-character-ai-live.png`
- `screenshots/<platform>/05-small-mobile-320x568/02-character-builder/combined-reference-ready.png`
- `screenshots/<platform>/05-small-mobile-320x568/03-character-library/saved-character-selection.png`
- `screenshots/<platform>/05-small-mobile-320x568/04-take-review/playback-review-settled.png`

Audit evidence from the superseded matrix remains relevant:

- The old `local-idle.png` opened Recipe Dock and did not protect the initial closed Studio.
- The old `character-ai-live.png` showed no selected character.
- The old 320px `latest-take.png` showed `Loading studio tool…`.
- The old 320px recording image showed cramped controls and a clipped Start AI label.

The new scenario definitions and readiness assertions address the first three test-state problems
in code. The intentional Wave 1 recording-state changes were regenerated and reviewed across all
five Darwin and Linux baseline viewports. UX-003 remains product work, and the physical/reflow
evidence portion of UX-006 is not fixed merely by accepting those screenshots.

## 18. Evidence from specific components or routes

| Evidence area                     | Primary files                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single route/composition          | `apps/web/src/studio/StudioApp.tsx`, `apps/web/src/studio/routeResolution.ts`                                                                                   |
| Overlay ownership                 | `apps/web/src/studio/useStudioOverlayController.ts`, `apps/web/src/ui/primitives/OverlayPanel.tsx`, `OverlayPanel.styles.ts`                                    |
| Persistent media                  | `apps/web/src/features/live-stage/MediaStage.tsx`, `MediaStage.styles.ts`                                                                                       |
| Session controls/touch recovery   | `apps/web/src/features/live-stage/MediaStage.tsx`, `MediaStage.test.tsx`, `apps/web/src/studio/StudioSessionControlBar.tsx`, `StudioSessionControlBar.test.tsx` |
| Header/capability state           | `apps/web/src/studio/StudioHeader.tsx`                                                                                                                          |
| AI chooser/disclosure path        | `apps/web/src/studio/AIExperienceChooser.tsx`, `apps/web/src/studio/StudioApp.tsx`                                                                              |
| Creative rail                     | `apps/web/src/studio/CreativeWorkspace.tsx`                                                                                                                     |
| Shelf intent/category             | `apps/web/src/features/creative-assets/useRecipeShelfController.ts`, Recipe Shelf components                                                                    |
| Character Builder                 | `apps/web/src/features/character-builder/CharacterBuilderForm.tsx`, `CharacterBuilderPanel.tsx`, `formStyles.ts`                                                |
| Capture                           | Capture Settings and recording-control components under `apps/web/src`                                                                                          |
| Take/voice                        | Take Review, `VoiceEffectsPanel.tsx`, Voice Library/List/Preview, `useTakeReviewFlow.ts`                                                                        |
| Recording memory                  | `apps/web/src/orchestration/recording/recordingAttempt.ts`, `recordingArtifacts.ts`, `docs/RECORDING_MEMORY_POLICY.md`                                          |
| AI session cap                    | `apps/api/src/features/realtime/routes.ts`, Decart token provider, browser API client/realtime adapter                                                          |
| Retained assets                   | reference-image asset store/routes, `docs/PRIVACY_AND_TEMPORARY_DATA.md`, `docs/ARCHITECTURE.md`                                                                |
| Responsive/accessibility journeys | `e2e/accessibility-responsive.spec.ts`, `e2e/successful-studio-journeys.spec.ts`, `e2e/studio-character-builder.spec.ts`                                        |
| Visual matrix/harness             | `e2e/studioVisualMatrix.ts`, `e2e/studio.visual.spec.ts`, `playwright.visual.config.ts`, `scripts/prune-visual-baselines.mjs`                                   |

Canonical observable journeys remain under `docs/userStories/`. This document should be updated when behavior, terminology, supported devices, session/recording limits, persistence consequences, or the screenshot matrix changes.
