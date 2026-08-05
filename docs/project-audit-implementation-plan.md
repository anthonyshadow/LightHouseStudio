# Project audit implementation plan

**Status:** validation-only

**Owner:** repository maintainers

**Source of truth:** [project audit findings](project-audit-findings.md)

**Last reviewed:** 2026-08-05

The current audit's technical phases are complete and recorded in
[completed work](project-audit-completed-work.md). Only environment-dependent validation remains:

- Perform physical-device and assistive-technology review at `1440×960`, `1280×720`, `834×1112`,
  `390×844`, and `320×568`, including 200% text/reflow, real camera switching, real codecs, touch,
  and constrained-memory behavior. Record results in [Manual QA](MANUAL_QA.md).
- Run the authorized [live-provider smoke](LIVE_PROVIDER_SMOKE.md) only when credentials, cost
  approval, exact provider/model selection, and non-personal fixtures are deliberately supplied.
- Keep ESLint 10 as a separate future migration; it is not required by the current Node 24 toolchain
  and must not be combined with unrelated maintenance.

Deterministic viewport containment, 200% text/reflow, provider-denial, cross-browser, production,
visual, coverage, dependency-audit, build-budget, link, command-reference, matrix, and retired-term
checks are automated and complete.

## Non-goals

Do not add accounts, public exposure, cloud persistence, billing, automatic paid retries, provider
fallback, a second media stage, a generic cross-store repository, or silent immutable-asset
eviction. Git history and retained legacy migration data remain intact.
