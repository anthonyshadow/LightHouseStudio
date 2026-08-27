## Implementation Prompt — Step 2: Say where the media actually goes

### Objective

Make the Studio idle stage state a privacy posture that is true for the running configuration,
instead of claiming unconditionally that nothing leaves the browser.

### Context

Lightframe Studio is a local-first browser video studio. It runs in several persistence
configurations selected by `DATABASE_MODE` (`local`, `shadow`, `postgres`, `neon`) and
`ASSET_STORE_PROVIDER` (local disk or Cloudflare R2). In `local` mode media genuinely stays on the
machine. In the other modes video bytes are uploaded to object storage and the creative library is
mirrored to the account.

The idle capture stage currently renders one sentence regardless:

> Camera and microphone remain off until you select Start camera. Nothing leaves this browser in
> Local mode.

This was verified in a running instance configured with `DATABASE_MODE=postgres`,
`ASSET_STORE_PROVIDER=r2`, where `GET /api/capabilities` reported
`creativeLibrary.cloudMirror: true` and `savedVideos.directMultipartUpload: true`. The claim is
false there.

The product is otherwise scrupulous about honest statements — the Assets export panel, for example,
volunteers that "Re-framing happens in this browser; the saved version is not changed." This step
brings the stage up to that standard.

### User Problem

The operator is given an explicit privacy assurance on the surface where they are deciding whether
to turn on their camera, and in some deployments that assurance is not true.

### Required Behavior

- Where media genuinely stays in the browser, the existing sentence is preserved **verbatim**.
- Where it does not, the stage says something short and accurate instead.
- The camera-and-microphone assurance ("Camera and microphone remain off until you select Start
  camera") is unconditional and unchanged in both cases — it is true regardless of persistence.
- If the posture cannot be determined, use the more conservative wording — never claim media stays
  local when that is unknown.

### Existing Areas to Inspect

Read these before changing anything, and confirm the current behaviour rather than assuming it:

- `apps/web/src/features/live-stage/MediaStage.tsx` — `emptyCopy(mode)` around line 153-173. Note
  that `mode` is `StudioMode` (the creative mode: `local`, `lucy-latest`, `lucy-vton-latest`), **not**
  a persistence mode. The three branches are creative-mode branches.
- `apps/web/src/features/live-stage/MediaStage.test.tsx` — existing assertions on this copy.
- `packages/contracts/src/capabilities.ts` — the capability response schema, including
  `savedVideos` and `creativeLibrary`.
- `apps/api/src/config/environment.ts` — how `DATABASE_MODE` and `ASSET_STORE_PROVIDER` relate, and
  which combinations are legal.
- `apps/api/src/features/system/` — where the capabilities response is assembled.
- However the web app already consumes capabilities (search for `useProviderAvailability` and the
  capabilities query) — reuse that path.
- `docs/PRIVACY_AND_TEMPORARY_DATA.md` — the authoritative statement of what actually leaves the
  machine in each mode. Make the copy agree with it; if the document and the code disagree, the code
  is the truth and you should say so in your report.

### Scope

- Determine the persistence posture on the client from data that already reaches it.
- Select the stage's description from that posture.
- Test both branches by fixing the capability response.

### Out of Scope

- Changing what is stored, or where.
- Adding a new `VITE_*` environment variable, or reading configuration from the bundle. Server
  configuration must not reach the client except through the API.
- Rewriting `docs/PRIVACY_AND_TEMPORARY_DATA.md`, unless you find it states something the code
  contradicts — in which case report it rather than editing it.
- The `lucy-latest` and `lucy-vton-latest` copy, which does not make a storage claim.
- Any other stage, panel or dialog copy.

### UX Requirements

- Both sentences must fit the idle stage at 375 px width without pushing the title or the icon out
  of view. Check at that width.
- Neutral tone. This is a statement of fact, not a warning — do not use a warning colour, an alert
  role, or an icon that implies a problem.
- Do not lengthen the copy substantially; the stage is a calm surface and the sentence sits under a
  large heading.
- The text must remain readable by a screen reader as part of the same description it is today; do
  not split it into a separate live region.

### Technical Requirements

- Prefer deriving the posture from the existing `/api/capabilities` response over adding a new
  endpoint. If the existing fields cannot express it unambiguously, adding one explicit field to the
  capabilities contract is acceptable — say so in your report and update
  `apps/api/src/route-inventory.test.ts` expectations only if the route set actually changes (it
  should not).
- Reuse the existing capabilities query and its loading semantics. Do not fetch capabilities a second
  time from this component.
- `MediaStage` renders on every Studio route. A failure to read capabilities must not blank or crash
  the stage — fall back to the conservative wording.
- Keep the copy in one place so it cannot drift, in the same spirit as
  `apps/web/src/features/export-placements/placements.ts`, which derives its copy from the domain.
- Do not change component structure, styling or props beyond what this requires.

### Acceptance Criteria

- With a capability response indicating cloud persistence, the stage does **not** claim media stays
  in the browser.
- With a capability response indicating local-only persistence, the existing sentence renders
  verbatim, character for character.
- The camera-and-microphone assurance renders in both cases.
- When capabilities are unavailable or still loading, the conservative wording renders and the stage
  does not error.
- Tests cover all three cases by fixing the capability response.
- The stage renders correctly at 375 px in both wordings.

### Regression Protection

- `MediaStage` is on every Studio route, including the Project workspace. Confirm the idle stage
  still renders on `/studio/create` and `/projects/:id/workspace`.
- Existing tests assert the current sentence. Update them for the local-persistence case rather than
  deleting them.
- Do not alter recording, camera-permission or device-state behaviour.

### Validation

Run only:

```bash
bun run --filter @studio/web exec vitest run src/features/live-stage
```

Add `bun run typecheck` only if you changed the capabilities contract. Do not run the full test
suite, the build, or the whole lint.

### Completion Report

State: every file changed; how the persistence posture is derived and why you chose that source;
both final wordings verbatim; whether the capabilities contract changed and if so exactly how; the
fallback behaviour when capabilities are unavailable; the validation commands and their output; and
whether `docs/PRIVACY_AND_TEMPORARY_DATA.md` agrees with what the code actually does.
