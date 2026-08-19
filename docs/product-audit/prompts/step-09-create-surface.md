## Implementation Prompt — Step 9: Make the create surface start creating

### Objective

Give `/studio/create` back to creating: collapse capture settings behind a control on desktop,
shorten their copy, make creative tools honestly unavailable before media exists, and mark a
navigation destination active while in Studio.

### Context

Lightframe Studio is a local-first, single-operator browser video studio (React 19 + Vite + Emotion).
`/studio/create` is the primary creation surface. It mounts the Studio capture runtime
(`apps/web/src/studio/StudioApp.tsx`) inside the persistent authenticated shell.

Observed in the running product at 1440×900:

- The media stage and the two primary actions (**Record New Video**, **Upload Video**) share the
  screen with a permanently docked **Capture settings** column that takes roughly a third of the
  desktop width, before the operator has any media.
- That panel's copy is written for an engineer: _"Device choices stay in this tab. Listing devices
  does not start the camera or microphone. Changes apply automatically."_, _"Studio rescans after a
  successful Start or a browser-reported device change. Opening this panel never requests
  permission."_
- The creative tool rail advertises **Edit Video**, **Select Character** and **Select Outfit** before
  any media exists, when none of them can do anything.
- No navigation item is marked active: `ShellChrome.tsx` computes `activeDestination` and falls
  through to `'studio'`, which is not one of the four ids `StudioHeader.tsx` matches against, so
  nothing receives `aria-current="page"`.

### User Problem

The first surface a creating user sees is dominated by device configuration, and they lose their
place in the navigation the moment they enter it.

### Required Behavior

- On desktop, capture settings are collapsed by default and open on request.
- A session error that points the operator at capture settings still opens **and focuses** them.
- Capture-settings copy is shorter and describes what the control does, not what it does not do.
- Creative tools are visibly unavailable, with a stated reason, until media exists.
- A navigation destination carries `aria-current="page"` while in Studio.
- Recording, device enumeration, permission recovery and auto-apply behave identically.

### Existing Areas to Inspect

- `apps/web/src/features/recording/CaptureSettingsPanel.tsx` — the `presentation` prop
  (`'overlay'` vs docked), the auto-apply effect keyed on `draftSignature`, the devices refresh
  effect, and the permission-blocked states
- `apps/web/src/studio/StudioApp.tsx` — `openCaptureSettings`, `openCaptureSettingsForRecovery`,
  `focusDesktopCaptureSettings`, the `desktopStudioLayout` flag, and the effect that closes
  `capture-settings` on a non-form session error
- `apps/web/src/studio/StudioWorkspace.tsx` and `StudioApp.styles.ts` — the desktop grid
- `apps/web/src/studio/CreativeWorkspace.tsx` — the tool rail and its `activeTool` state
- `apps/web/src/studio/useStudioActivityModel.ts` — the existing blocked-reason strings, which are
  the right source for a tool's unavailability reason
- `apps/web/src/app/shell/ShellChrome.tsx` — `activeDestination`
- `apps/web/src/studio/StudioHeader.tsx` — `destinations`, `StudioHeaderDestination`,
  `aria-current`
- `apps/web/src/features/recording/useCapturePreferences*` — the controller whose semantics must not
  change
- `e2e/studioVisualMatrix.ts`, `playwright.visual.config.ts` — the affected baselines

### Scope

- Collapse the desktop capture-settings panel behind a control, preserving the overlay behaviour on
  mobile.
- Shorten the panel's introductory and helper copy.
- Give the creative tool rail a clear disabled state with a reason before media exists.
- Add a Studio destination to the navigation (or mark an existing one) so `aria-current` is always
  set.

### Out of Scope

- Recording, finalization, device enumeration, permission handling or the capture preferences
  controller's semantics.
- The mobile capture-settings overlay behaviour.
- Aspect ratios and formats — a later step adds 1:1 and 4:5.
- The AI experience chooser, the existing-video panel or the voice panel.
- Any change to `StudioExitGuard`.

### UX Requirements

- The stage and the two primary actions must be the dominant elements at every desktop width.
- The capture-settings control must state what it opens and reflect the current camera/microphone
  status compactly, so collapsing it does not hide a problem.
- **Do not hide a blocked-permission state.** If the camera is blocked or unavailable, that must
  remain visible on the surface, not only inside the collapsed panel.
- A disabled tool must state its condition in words, not just grey out. Reuse the blocked-reason
  strings that `useStudioActivityModel` already produces.
- Preserve `focusDesktopCaptureSettings` behaviour when the panel opens for error recovery.
- Maintain the viewport-bound layout contract: the document must not scroll, and named overlay
  bodies own scrolling.
- Maintain the tested viewports, including 320×568 and the 200 %-text reflow cases.

### Technical Requirements

- Do not change `CapturePreferencesController`: auto-apply on `draftSignature` change,
  `discardPending` on a failed apply, and the devices-refresh-on-idle effect must all behave
  identically.
- The panel must remain mounted or remount without losing draft state when toggled — verify which,
  and preserve whichever the controller expects.
- `openCaptureSettingsForRecovery` must still open and focus the desktop panel.
- Adding a navigation destination means updating `StudioHeaderDestination` and both the primary and
  mobile navs; keep them in sync as they are today.
- No new network requests, no new polling.

### Acceptance Criteria

1. On desktop, capture settings are collapsed by default and open on request without losing draft
   state.
2. A blocked or unavailable camera remains visible on the surface when the panel is collapsed.
3. A non-form session error that points at capture settings still opens and focuses them.
4. Creative tools are visibly unavailable with a stated reason until media exists, and become
   available immediately when it does.
5. A navigation item carries `aria-current="page"` on `/studio/create`.
6. Recording, device selection, auto-apply and permission recovery are unchanged.
7. The document still does not scroll at any tested viewport.

### Regression Protection

- `apps/web/src/features/recording/CaptureSettingsPanel` tests and the Studio tests must pass; update
  only assertions that depend on the panel's default open state.
- `apps/web/src/studio/StudioHeader.test.tsx` asserts one shared organization rail with a mirrored
  mobile navigation — keep that property.
- Visual baselines for the Studio matrix will change; regenerate them deliberately and say so.
- Verify the mobile overlay path is untouched.

### Validation

```bash
npx vitest run apps/web/src/features/recording apps/web/src/studio apps/web/src/app
```

Then:

```bash
npx playwright test --config playwright.visual.config.ts && npx playwright test e2e/successful-studio-journeys.spec.ts e2e/accessibility-responsive.spec.ts
```

### Completion Report

Report the collapsed-panel mechanism and whether the panel stays mounted, how a blocked-permission
state stays visible, how the recovery focus path was preserved, the tool-rail disabled reasons used
and where they came from, the navigation change, and the visual baselines regenerated.

### Working rules

Audit the affected area before changing it — this is the most layout-sensitive surface in the product
and the capture preferences controller has subtle auto-apply semantics. Understand them from the code
before editing. Reuse existing blocked-reason strings rather than writing new ones. Make no unrelated
changes and remove no existing functionality. Do not guess. Maintain responsive behaviour,
accessibility and performance. Run only the checks above. Report exactly what changed.
