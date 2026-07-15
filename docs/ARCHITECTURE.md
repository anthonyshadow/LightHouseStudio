# Architecture and ownership

Lightframe Studio is a strict TypeScript npm workspace with a React browser app, a loopback Fastify broker, pure domain rules, runtime API contracts, and an explicit deny-external test policy. It was organized around product capabilities rather than around a previous implementation.

## Workspace boundaries

| Boundary                     | Responsibility                                                    | Must not own                                |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `packages/domain`            | Pure session, prompt, asset, recording, and voice rules           | React, browser globals, HTTP, provider SDKs |
| `packages/contracts`         | Zod schemas and app-owned request/response types                  | Raw provider response types, secrets        |
| `packages/testing`           | Shared deny-external test policy                                  | Live providers or physical devices          |
| `apps/web/src/features`      | Focused UI and presentation models by capability                  | Permanent credentials, server persistence   |
| `apps/web/src/orchestration` | Async lifecycle coordination and resource handoff                 | Raw provider payload assumptions            |
| `apps/web/src/adapters`      | Browser APIs, same-origin API calls, Decart SDK, audio processing | Product policy decisions                    |
| `apps/api/src/application`   | Transport-neutral server payload types                            | Fastify replies or provider implementations |
| `apps/api/src/features`      | HTTP route validation and application services                    | Browser state, product database             |
| `apps/api/src/providers`     | Decart and ElevenLabs protocol adaptation                         | UI/domain leakage, unsafe upstream errors   |
| `apps/api/src/http`          | Loopback/origin boundary, safe errors, streaming lifetime         | Provider-specific business rules            |

Imports should point inward toward pure rules and contracts. The web app does not import API implementation code, and the API does not know about React.

## Session data flow

1. The user edits a mode-specific `SessionDraft`. Text assets and the structured workshop may be used without media access.
2. Model input is validated before camera access. Local mode needs no AI input.
3. Explicit Start obtains or reuses local media. A model start resolves the selected model's camera requirements only after validation.
4. After healthy local video exists, the browser requests a short-lived credential from the loopback broker.
5. The broker validates Host, an Origin with the exact same loopback host and port, the body, and the model allowlist. It then asks Decart for a five-minute credential scoped to exactly `lucy-2.5` or `lucy-vton-3` and that verified application origin.
6. The browser dynamically imports the official Decart SDK and connects a cloned provider-input stream derived from the owned local tracks. Local preview remains independently owned and available as the display fallback until a live transformed video track exists.
7. Start or Apply sends one complete prompt/image/enhancement snapshot. `image: null` is meaningful: it clears provider image state.
8. The last successful snapshot becomes `AppliedRealtimeState`. Further edits stay pending until Apply; Revert restores the working draft.
9. Stop/Reset invalidates the operation generation, aborts the browser token request, disconnects provider resources, and disposes late results. Reset also clears the ephemeral reference and applied state.

The guide's Lucy 2.1 character identifier was intentionally superseded by the user's approved `lucy-2.5`. The VTON boundary remains independently selectable and testable as `lucy-vton-3`.

## Recording and processing flow

Recording source composition is explicit:

| Session                    | Video                  | Audio                                                |
| -------------------------- | ---------------------- | ---------------------------------------------------- |
| Local                      | Live local camera      | Live local microphone when present                   |
| Model before usable output | Not recordable         | Not applicable                                       |
| Model with usable output   | Live transformed video | Provider audio when live, otherwise local microphone |

`MediaRecorder` receives a new composed stream that references source tracks but does not own or stop them. An audio-only sidecar is recorded at the same time when audio is available. The chosen video and audio track identities are pinned while recording. If a selected track ends or a provider callback would change the selected source, the take finalizes first; source recomposition and provider-audio/microphone fallback apply to the next take.

Decart may emit successive `MediaStream` objects that share accumulated track instances as audio and video subscribe independently. Session orchestration retains partial streams without displaying them, promotes only a live-video stream, preserves shared track identities across callbacks, and stops only tracks absent from a true replacement.

Recording orchestration separates the recorder attempt/lifecycle from a focused artifact owner for takes, processing state, unload protection, and object-URL release. Main-video finalization is authoritative: an optional sidecar timeout or failure produces a sidecar error while preserving a valid video. The session hook owns camera/provider streams and provider clients. For a model take, recording finalization is awaited before the model disconnects; the completed Blob and URL remain valid while the healthy local preview continues.

The original video and sidecar are immutable processing sources. Local Web Audio effects render offline, then Mediabunny copies encoded video while replacing audio. ElevenLabs conversion sends only the sidecar after explicit Apply and remuxes the returned audio the same way. A processed artifact replaces presentation only after success; cancel or failure preserves the last valid artifact.

## Creative asset persistence

The Recipe Shelf is behind a repository interface. It treats `localStorage` as untrusted input, validates a schema version, allowlists fields, normalizes records, enforces collection limits, and reports one of three health states:

- `ready`: durable browser storage is available;
- `recovered`: corrupt or outdated records were dropped and the usable subset was repaired;
- `session-only`: storage is unavailable or a write failed, so the in-memory repository continues for this tab.

Only prompt text and bounded metadata are durable. The repository's explicit reference-image status documents that a saved character prompt contains no portrait bytes or URL.

## Backend boundary

The Fastify server binds to `127.0.0.1` and rejects non-loopback Host headers. Provider mutations—realtime token issuance, public voice import, and voice conversion—also require a canonical loopback `Origin`. Responses use no-store headers.

Permanent provider keys remain in server environment memory. App-owned Zod contracts validate every HTTP boundary, and provider adapters normalize upstream data. Automatic request URL logging is disabled because voice search terms and provider ids are ephemeral user data. Error mapping may retain a numeric upstream status and inspects only bounded allowlisted error-code/parameter fields; it excludes raw bodies/messages, request IDs, provider URLs, keys, temporary credentials, and stack traces. Invalid-audio codes are classified before plan guidance, and zero-retention guidance requires both an exact entitlement code and `param: enable_logging`, so malformed sidecars are never mislabeled as entitlement problems.

The backend is intentionally stateless: no database, accounts, media upload store, analytics, jobs, migrations, or session history. This keeps the local-first privacy model inspectable. It is not a public multi-user security design.

## Ownership and cleanup rules

- Session orchestration owns local/remote streams, cloned provider-input tracks, provider client, start abort controller, operation generation, preview URL, and live timers.
- Recording orchestration owns `MediaRecorder` instances, recording chunks, the audio sidecar, artifact URLs, and unload protection.
- Voice processing owns processing abort controllers and temporary Web Audio/remux resources; it never mutates the originals.
- The Recipe Shelf owns only serialized text and metadata.
- The API owns request abort/timeout wiring and upstream stream closure for the duration of each HTTP request. ElevenLabs fetches receive the abort signal. Decart SDK `0.1.14` token creation does not expose one, so the broker races and discards a late token result but cannot cancel that already-started upstream fetch.

Late async work checks its operation or abort signal before committing. Replaced owned streams and object URLs are disposed; referenced source tracks used for recording are not stopped by recording or processing code.

## Deployment assumptions

Development uses two loopback ports with Vite proxying `/api`. A production build is served by Fastify from one origin. `localhost`/loopback is treated as the secure local camera context; non-loopback deployment requires HTTPS plus a separate design for authentication, CSRF, authorization, tenant isolation, rate limiting, provider-cost abuse, observability, and secrets.

## Testing seams

Pure domain functions cover deterministic rules. Repository storage and the voice-library client are injectable. Fastify provider dependencies and `fetch` are injectable. Browser adapters isolate `MediaStream`, `MediaRecorder`, Web Audio, and Decart SDK effects. Network contracts use app-owned schemas. Vitest replaces both external `fetch` and `WebSocket`; Playwright journeys route-deny external HTTP and WebSockets.

Successful browser journeys use a narrow Vite-development-only realtime driver for synthetic media and provider callbacks. The branch is guarded by `import.meta.env.DEV`. A Vite `generateBundle` guard fails every production build if the seam identifier remains in executable chunks, and production source maps are disabled so the development source is not published indirectly. Default tests therefore cover Local, Lucy 2.5, and VTON 3 without devices, credentials, paid traffic, or a production mock switch.
