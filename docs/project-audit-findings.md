# Project audit findings

**Status:** current audit closed; manual/live validation remains

**Owner:** repository maintainers

**Last reviewed:** 2026-08-05

This document records the repository-wide risks verified by the current audit and their resolved
technical outcomes. Product behavior is
defined by [Product state](product-state.md), [Architecture](ARCHITECTURE.md), and the observable
[user stories](userStories/README.md). Release validation is defined by [Testing](TESTING.md) and
[Manual QA](MANUAL_QA.md).

## Resolved findings

| Area                     | Verified concern                                                                       | Implemented outcome                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider transport       | Authenticated provider requests lacked one bounded redirect-safe transport.            | Decart, Pruna, and ElevenLabs now reject redirects, enforce deadlines and byte limits, cancel bodies, and translate failures into app-owned errors.                                      |
| Paid submission recovery | A lost successful Existing Video response could encourage another billable submission. | One operation UUID is stored before `PUT`; ambiguous acceptance recovers with `GET`; only confirmed not-found plus explicit resubmission creates another UUID.                           |
| Media classification     | Strict transport parsing obscured user-input versus provider-output failures.          | Raw facts are parsed before context-specific policy, producing precise upload errors and safe invalid-upstream `502` errors.                                                             |
| Video-job scheduling     | Active lookup, deadlines, polling, and cleanup scaled linearly or repeated work.       | Owner/job indexes, generation-token deadline heap, cached 2/3/5/8/10-second cadence, duplicate coalescing, leases, and retryable cleanup replace repeated linear work.                   |
| Browser memory           | Several media paths allocated complete bodies before enforcing limits.                 | Browser reads stream through `readBoundedBlob`; video output avoids the final full copy; ElevenLabs media is spooled through private temporary files.                                    |
| Render lifecycle         | Worker and WebGL setup had partial-initialization and cancellation windows.            | Initialization is guarded, cancellation acknowledged, stale events suppressed, partial resources disposed, and stable renderers reused across edit-only changes.                         |
| Reference-image lookup   | Legacy recovery scanned directories on request misses.                                 | One startup repair builds versioned owner/request mappings; steady-state reads are O(1), streamed delivery is available, and legacy immutable assets remain readable.                    |
| Responsive layout        | Actions and upload guidance overlapped or became cramped at `320×568`.                 | Narrow actions are single-column, short-height chooser guidance is condensed, touch-only drag copy is omitted, and named-region scrolling remains intact.                                |
| Maintainability          | Large orchestration and presentation modules mixed distinct concerns.                  | Pure reducers, narrowly propped sections, lifecycle helpers, explicit storage migrations, and semantic shared utilities reduce duplication without adding owners or weakening contracts. |
| Tests and tooling        | Consequential paths lacked targeted coverage and development tooling had advisories.   | Focused transport/recovery/worker/storage/streaming tests, repository-integrity checks, build budgets, JSDOM 30.0.1, and patched Esbuild are in place; dependency audits are clean.      |

## Verified non-findings

- No dead production files, production dependency cycles, orphaned guided-character assets, or
  removable production dependencies were found by the audit.
- `LegacyProjectManager`, guided-design migration data, guided-character assets, and
  Storybook-facing barrel exports remain intentional compatibility surfaces.
- The current localStorage creative repository remains appropriate at present limits. A future
  IndexedDB migration must be repository-specific and triggered by measured quota or volume needs.
- Loopback-only, single-operator operation remains the current security boundary. Accounts,
  public exposure, billing, and cloud persistence require separate designs and approval.

## Remaining validation boundary

Automated checks establish deterministic application behavior; they do not prove physical-device,
assistive-technology, real-codec, memory-pressure, or live-provider behavior. Record those results
through [Manual QA](MANUAL_QA.md) and the authorized [live-provider procedure](LIVE_PROVIDER_SMOKE.md).
Do not include credentials, personal media, raw provider payloads, URLs, device identifiers, or
network archives in repository evidence.
