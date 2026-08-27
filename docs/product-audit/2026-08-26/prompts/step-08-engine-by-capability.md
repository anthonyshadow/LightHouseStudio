## Implementation Prompt — Step 8: Choose an engine by what it does

### Objective

Replace the "Decart API" / "Pruna API" toggle in the Character Swap configuration with a choice the
operator can actually make, described by capability rather than by vendor.

### Context

When configuring a Character Swap, Lightframe asks the operator to choose between two options
labelled **"Decart API"** and **"Pruna API"**. The operator has no basis on which to choose, and the
two behave materially differently.

Those differences are already fully modelled and already sent to the client. From a running instance,
`GET /api/capabilities` returned, under `videoProcessing.characterSwap.providers`:

|                          | Decart      | Pruna               |
| ------------------------ | ----------- | ------------------- |
| `inputPreparation`       | `none`      | `h264-mp4`          |
| `referencePolicy`        | `optional`  | `required`          |
| `promptInput`            | `editable`  | `server-default`    |
| `promptEnhancement`      | `true`      | `false`             |
| `terminalFailureRelease` | `automatic` | `explicit-user`     |
| `outputResolutions`      | `['720p']`  | `['720p', '1080p']` |

None of that reaches the label. Instead, the reference requirement surfaces afterwards as a warning:
"This Character Swap configuration requires one identity reference image. Prompt-only saved
Characters need a reference before processing can start."

The product already has an excellent model for this problem.
`apps/web/src/features/export-placements/placements.ts` asks "where is this going?" instead of "what
aspect ratio?", and derives every word from the domain so the copy cannot drift from behaviour.
**Follow that pattern.**

### User Problem

A consequential, cost-bearing choice is presented as two vendor names, and its most important
consequence — that one option requires a reference image — appears only after it has been made.

### Required Behavior

- Neither option's primary label is a vendor name.
- Each option states what it does: whether the operator can write a prompt, whether a reference image
  is required, and what resolutions it can produce.
- The reference requirement is visible **at the point of choice**, not afterwards.
- The vendor identity remains reachable for anyone who wants it, through a secondary disclosure.
- Where only one provider is configured, no choice is presented at all.

### Existing Areas to Inspect

- `apps/web/src/features/existing-video/ExistingVideoVisualEditor.tsx` — the provider group around
  line 167 (`role="group" aria-label="Character Swap API"`), the resolution control, and the reference
  warning
- `packages/contracts/src/capabilities.ts` — `characterSwapProviderCapabilitySchema` and
  `videoProcessingOperationCapabilitySchema`; these are the fields your copy must derive from
- `packages/contracts/src/video-jobs.ts` — `videoCharacterSwapProviderIdSchema`
- `apps/web/src/studio/useProviderAvailability.ts` — how capabilities reach this surface
- `apps/web/src/features/export-placements/placements.ts` — **the pattern to copy**: a copy table
  keyed by a domain value, with helpers deriving labels, short labels and hints
- `apps/web/src/features/media-session/ReferenceImageField.tsx` — the reference image control whose
  requirement you are surfacing earlier
- `apps/web/src/ui/primitives/SegmentedControl.tsx` — the "choose one of N" primitive the repository
  has settled on

### Scope

- Derive each engine's description from the capability response.
- Replace the vendor labels with those descriptions.
- Surface the reference requirement as part of the choice.
- Keep the vendor id available in a disclosure.

### Out of Scope

- **Changing which providers are available, or the default.** `defaultProvider` comes from the server
  and stays authoritative.
- Any change to provider contracts, request shapes, submission counting, cost statements or consent
  copy.
- Changing `videoCharacterSwapProviderIdSchema` or any provider id.
- The Virtual Try-On surface, which has a single provider.
- Removing the existing reference warning entirely — it should still appear if the operator reaches
  submission without a reference; you are adding earlier visibility, not replacing the guard.

### UX Requirements

- Descriptions must fit the overlay at 375 px. Check.
- The `aria-label` on the provider group must stop saying "API".
- Prefer a short capability-led label with supporting detail, exactly as `exportPlacementLabel` and
  `exportPlacementHint` do — not a paragraph per option.
- The reference requirement should read as a requirement, not as an error, before it is violated.
- The vendor name must remain discoverable for support — a disclosure, a footnote or a `title`, your
  choice, stated in your report.
- Keyboard behaviour and the selected state must be unchanged.

### Technical Requirements

- **Derive every word from `characterSwapProviderCapabilitySchema`.** Do not hard-code prose keyed on
  a provider id alone — if a third provider is configured tomorrow, or an existing one's capabilities
  change, the copy must follow automatically. A copy table keyed by _capability shape_ is acceptable;
  a copy table keyed by _vendor_ is not.
- Reuse `SegmentedControl` if it fits; do not hand-roll a radio group.
- Do not add a network request. The capability data is already on the client.
- Preserve capability gating: an unavailable provider must not be offered.
- Handle the single-provider case without rendering an empty or one-option control.

### Acceptance Criteria

- Neither option's primary label is "Decart API", "Pruna API", or any vendor name.
- Each option states its prompt behaviour, its reference requirement and its available resolutions,
  all derived from the capability response.
- Selecting the option that requires a reference explains that requirement at the moment of
  selection.
- The vendor id remains reachable through a disclosure.
- With one provider configured, no provider choice is rendered.
- The group's accessible label no longer says "API".
- Cost statements, consent copy and submission counts are unchanged.
- The surface renders correctly at 375 px.

### Regression Protection

- Provider selection must still produce the same submission for the same choice — verify the request
  shape is byte-identical to before for each provider.
- The existing pre-submission reference guard must still block submission when no reference is
  present.
- Capability gating must still hide unavailable providers and unavailable resolutions.
- Existing tests assert on the vendor labels; update them to the new copy.

### Validation

Run only:

```bash
bun run --filter @studio/web exec vitest run src/features/existing-video
bun run --filter @studio/contracts exec vitest run
```

Do not run the full test suite or the build. **Never submit a provider job during validation.**

### Completion Report

State: every file changed; the final label and supporting text for each engine, verbatim; exactly
which capability fields each phrase derives from; how a third provider would be described without a
code change; where the vendor id remains reachable; how the single-provider case renders; confirmation
that the submitted request shape is unchanged for each provider; and the validation commands and their
output.
