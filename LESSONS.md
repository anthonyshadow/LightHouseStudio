# Engineering lessons

Keep only lessons that should constrain future work.

## Own every resource

- The creator of a stream, track, recorder, URL, timer, listener, database handle, abort
  controller, or provider client owns replacement and idempotent shutdown.
- Recheck ownership after awaited acquisition. A resource that resolves after its owner closes
  must be released before returning.
- Recording borrows source tracks. Final recorder data and the optional sidecar settle before the
  session releases its sources.
- React StrictMode is a real lifecycle; reopenable resources need an owner that supports cleanup
  and reacquisition.

## Cancellation belongs to each caller

- A shared upstream operation and each subscriber's cancellation are separate state.
- Cancel shared work only when policy permits and no subscriber remains.
- Billable or idempotent work may need to settle so retries observe truthful in-progress or
  completed state.
- Carry the request signal through every service and provider layer.

## Local does not mean trustless

- Loopback Host checks are not public authentication.
- Browser actions that contact a provider require explicit intent; provider reads must not be
  triggerable by an ambient cross-site request.
- Credentials, raw provider messages, URLs, payloads, and causes never enter browser state or
  client-visible errors.

## Recover persisted data narrowly

- Treat browser JSON and IndexedDB records as untrusted, versioned input.
- Repair idempotency only for an exact owner/request match.
- Remove only app-owned temporary data or an explicitly isolated whole environment. An unlinked
  immutable asset may still have a relationship outside the current process.
- Keep stores with different transaction models behind separate repositories.
- Model reusable versions as normalized children and resolve them at the handoff boundary. Do not
  fork every downstream consumer or persist a preferred version before the referenced bytes have
  hydrated successfully.

## Preserve composition invariants

- Characterize DOM/media identity, handoffs, late results, and cleanup order before extracting a
  coordinator.
- Keep one persistent stage and one shared overlay system; split controllers at ownership and
  lifecycle boundaries.
- Lazy loading helps only when static imports do not pull the same feature back into the entry
  graph.

## Separate user errors from diagnostics

- Map only confirmed, allowlisted provider failures to app-owned recovery codes.
- Unknown faults are internal failures.
- Diagnostics use a small safe allowlist; behavior depends on stable codes, never display copy.

## Make constraints executable

- Tests deny unexpected external HTTP and WebSockets.
- CI enforces types, lint, formatting, package boundaries, unresolved imports, cycles, dead code,
  coverage, builds, and curated visuals.
- Screenshot readiness is semantic; a stable fallback is not a valid product state.
- Physical devices and live providers remain separate release gates because mocks cannot qualify
  codecs, memory, entitlements, retention, or output.

## Separate provider acceptance from local completion

- An accepted billable submission is an immutable fact. Poll, content retrieval, inspection, and
  remux retries must reuse it; only a fresh explicit action may submit another job.
- Multi-step cost consent belongs between completed artifacts. Preserve the intermediate result
  and require approval before the next model rather than treating a chain as one opaque action.
- Browser inspection improves usability, but streamed server inspection is the trust boundary for
  provider input and retrieved output.
- Source audio is an immutable composition input. Visual providers may replace video, but they do
  not become the source of truth for final audio.
- Keep provider/model selection at the server startup boundary. Browser orchestration should use
  app-owned operation capabilities, while adapters own exact model fields, response states,
  allowlisted delivery locations, and provider-specific input preparation requirements.
- Capability-required transcoding creates an ephemeral submission resource at explicit Start; it
  must be revalidated and cleaned without replacing the immutable source or implying remote
  deletion.
