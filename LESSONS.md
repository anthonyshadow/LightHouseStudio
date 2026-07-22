# Engineering lessons

These are repository-level corrections worth preserving when similar work is added later.

## Ownership before convenience

- Never change permissions on a user-configured base directory. Create and secure only directories and files the application owns.
- A component, controller, or service that creates a stream, database handle, object URL, abort controller, timer, or provider operation must also define replacement and shutdown behavior.
- An async open can finish after its owner closes. Recheck ownership after every awaited acquisition and close a late resource before returning.
- React StrictMode cleanup/remount is a real lifecycle. Reopenable resources need an owner wrapper; render-time construction plus one-way `close()` is insufficient.

## Cancellation is subscriber state

- A shared upstream promise and a shared caller signal are different concepts. Each waiter needs independent cancellation and settlement.
- Cancel upstream work only when that operation's policy allows it and no subscriber remains. Owner-exclusive, billable work may need to continue until settlement so retries observe a truthful in-progress state.
- Parallel provider branches should share an operation-local abort controller so a terminal sibling failure stops work that can no longer contribute to a result.
- Pass the HTTP request signal through every service/provider layer; do not stop cancellation at the route boundary.

## Localhost still needs browser-intent boundaries

- Same-origin response secrecy does not prevent a hostile page from causing a cross-site GET. Provider-contacting local reads require a non-simple, validated intent header in addition to loopback host/origin controls.
- Provider audio previews are explicit fetches with an owned Blob URL, not ambient media-element URLs. Abort and revoke on replacement and unmount.

## Persistence must recover narrowly

- Treat persisted JSON as untrusted. Recover or quarantine syntax/schema failures, but do not swallow filesystem I/O and permission errors.
- Idempotency repair must match the exact owner and request identity before rewriting a mapping.
- Remove only stale temporary paths with an app-owned naming/layout contract. Ordinary orphan assets may still be referenced by history outside the current process.
- Keep migration and sanitation business rules canonical in the domain; repository envelopes handle only absence, nullability, and storage mechanics.

## Composition deserves characterization

- Before extracting a UI coordinator, test stable DOM/media identity, resource continuity, atomic handoffs, and cleanup order—not just route helpers or isolated child rendering.
- Split workflow ownership into focused controllers while keeping the persistent media stage and local React state. A global store is not a prerequisite for a smaller composition shell.
- Lazy loading is useful only when static barrel imports do not pull the same module back into the entry graph.

## Errors and diagnostics are separate products

- Unknown faults are internal failures, not provider failures. Classify only confirmed upstream errors as provider failures.
- Client error bodies stay stable and sanitized. Server diagnostics use an explicit allowlist: request ID, method, route template, elapsed time, normalized class/reason/code/status, numeric upstream status, and sanitized call-site frames.
- Never log request URLs, query strings, bodies, prompts, provider URLs, raw messages, nested causes, keys, or temporary credentials.
- Error behavior must depend on stable reason codes, never human-readable copy.

## Gates should encode architecture

- CI uses a clean install and independent quality, coverage, browser, and curated visual jobs. Failure artifacts aid diagnosis without introducing deployment automation.
- Dead-code entrypoints, module cycles, unresolved imports, package boundaries, runtime globals, and zero-warning lint are executable constraints, not documentation.
- Coverage includes all production sources and thresholds ratchet from the measured post-refactor floor.
- Keep the visual suite small and enforceable. Broader screenshots are manual artifacts, not tracked pseudo-assertions.
- Use the dedicated empty-directory operation for portable artifact cleanup; generic `rm` reports different directory errors across platforms.
