## Implementation Prompt — Step 1: Make the provider safety switch configurable

### Objective

Replace the hard-coded `disable_safety_checker: true` in the Pruna video-replace provider with an
environment-driven setting that defaults to provider content filtering being **enabled**, and remove
the TODO that asks for exactly this.

### Context

Lightframe Studio is a local-first, single-operator browser video studio (Bun workspace, TypeScript).
`apps/api` is a Bun + Elysia service wrapped as `ApplicationRuntime`; configuration is parsed once by
a Zod schema in `apps/api/src/config/environment.ts` and passed to providers as `RuntimeConfig`.
Providers never read `process.env` directly.

`apps/api/src/providers/pruna/video-replace-provider.ts` currently submits, around line 239:

```ts
//TODO Before making project public, change to false and make configured for local development by environment variable
disable_safety_checker: true,
```

This is the only remaining TODO of its kind in the repository and it is a release gate.

### User Problem

None directly today — the app is loopback-only and single-operator, and this is a deliberate local
choice. But the setting is not configurable, the safe value is not the default, and the repository's
own comment says it must change before the product is shown to anyone else.

### Required Behavior

- A new boolean environment variable controls the value submitted to the provider.
- When the variable is absent or empty, provider content filtering is **enabled** (i.e. the
  submitted `disable_safety_checker` is `false`).
- When the variable is set to the permissive value, today's behaviour is reproduced exactly.
- The value reaches the provider through `RuntimeConfig`, not through a direct `process.env` read.

### Existing Areas to Inspect

- `apps/api/src/config/environment.ts` — the Zod schema, `strictBooleanSchema`, and how other
  provider flags such as `PRUNA_VIDEO_REPLACE_ENABLED` are declared and validated
- `apps/api/src/providers/pruna/video-replace-provider.ts` — the constructor, the options object,
  and the submit payload
- `apps/api/src/app.ts` — where `PrunaVideoReplaceProvider` is constructed via
  `createExistingVideoProviderRegistry`
- `apps/api/src/providers/video-jobs/provider-factory.ts` — how config reaches the provider
- `apps/api/src/providers/pruna/video-replace-provider.test.ts` — the existing test and its own TODO
- `.env.example`, `.env.production.example`
- `docs/PRIVACY_AND_TEMPORARY_DATA.md` — where provider contact and cost boundaries are documented

### Scope

- Add the environment variable to the Zod schema with a safe default.
- Thread it through the provider factory into the provider.
- Use it at the submit call site.
- Update `.env.example` and `.env.production.example`.
- Update the provider-contact documentation to state the setting and its default.
- Remove both TODO comments (implementation and test).

### Out of Scope

- Any other provider.
- The reference-image provider or model selection (`REFERENCE_IMAGE_PROVIDER`,
  `WIRO_REFERENCE_IMAGE_MODEL`).
- Any UI, capability flag, or `/api/capabilities` change.
- Any change to job lifecycle, retry, cost warnings or error mapping.

### UX Requirements

None. This change is invisible in the product.

### Technical Requirements

- Follow the existing `strictBooleanSchema(defaultValue)` pattern; do not introduce a new parsing
  style.
- Name the variable consistently with its siblings (`PRUNA_*`).
- The provider must receive the value as a constructor option, matching how the timeout and fetch
  implementation are already passed.
- Do not add a `superRefine` cross-field requirement unless one is genuinely needed.
- Keep the submitted payload shape otherwise byte-identical.

### Acceptance Criteria

1. Omitting the new variable results in a submitted payload with content filtering **enabled**.
2. Setting it to the permissive value reproduces the current payload exactly.
3. The provider reads the value from its options, never from `process.env`.
4. `.env.example` and `.env.production.example` document the variable and its default.
5. The provider-contact documentation states the setting, its default and its effect.
6. Neither TODO comment remains.

### Regression Protection

- Existing Pruna submission tests must still pass; add a case for each value of the new flag.
- Do not change the status-URL validation, the response schema, timeouts, or error mapping.
- Confirm `apps/api/src/route-inventory.test.ts` and `shared-contract-parity.test.ts` still pass —
  neither should be affected.

### Validation

```bash
bun run --filter @studio/api typecheck && npx vitest run apps/api/src/providers/pruna apps/api/src/config && bun run check:docs
```

### Completion Report

Report the variable name and default, the files changed, both call sites (schema and submit), the
documentation updated, the tests added, and confirmation that the default is the filtering-enabled
value.

### Working rules

Audit the affected area before changing it. Understand current behaviour from the code, not from
comments or documents. Reuse existing patterns. Make no unrelated changes and remove no existing
functionality. Do not guess — if something cannot be determined, say so and stop. Update the
documentation this change affects and run `bun run check:docs`. Run only the checks above. Report
exactly what changed when finished, including anything you deliberately did not do and why.
