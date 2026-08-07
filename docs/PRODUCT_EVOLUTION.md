# Product evolution

This file preserves durable rationale for intentional product changes. Current behavior belongs in
[Architecture](ARCHITECTURE.md) and the [observable user stories](userStories/README.md).

## Local ownership added accounts and saved libraries

Phase 1 added one configured seeded local user with real password verification, a 24-hour
HTTP-only cookie session, and server-derived resource ownership. This remains a loopback-only
single-operator design, not a claim of public authentication or multi-user tenancy. Development
temporarily prefills both configured credentials; production does not expose them.

Save Video became distinct from Download. Owner-scoped files back gallery records with immutable
versions and optional thumbnails; logical deletion retains unreferenced bytes until Phase 2.
`/studio/videos`, `/studio/characters`, and `/studio/outfits` are private views inside the same
Studio runtime. The cutover intentionally clears retired Guided videos instead of importing them.
Saved Voices became Lightframe-owned user relationships, so removal no longer deletes provider
voices.

## Entry became separate from the Studio runtime

Studio originally rendered directly at `/`, and every retired or unknown path canonicalized to
that same runtime. The application now keeps a minimal provider-free entry at `/` and lazy-loads
the one Studio runtime at `/studio`. Retired Studio links initially redirected into that runtime
during the transition; those URL aliases and their navigation-state handoff have since been
removed. The later saved-library children under `/studio/*` keep that same mounted runtime, and
every unknown path returns to the entry. Browser-local data is now sanitized and namespaced by the
stable local user rather than route path.

Browser Back and Forward hand focus between Enter and the Studio main landmark. Recording and
finalization cannot be abandoned by routing; temporary take, Voice, and dirty Shelf work requires
confirmed discard. This routing layer does not authorize public deployment.

## One Studio replaced parallel journeys

`/studio` and its saved-library children share the sole media runtime. Guided is not revived;
retired project data is cleared during authenticated Studio initialization.

One persistent media stage now owns preview, transformed video, recording, finalization, and
playback. Dock, Capture Settings, Workshop, Shelf, Character Builder, Take Review, Voice, and
Legacy Projects are overlays. This avoided parallel media sessions, modal systems, and stores.

## Local preview preceded provider work

An earlier primary path became **Start Camera + Mic → Start AI**. Drafting, uploads,
saved-character selection, and local capture did not require provider credentials, SDK loading,
token minting, or external media traffic. Provider contact remained explicit and cost-sensitive.

Character used exact `lucy-latest` and VTO remained separately pinned to `lucy-vton-latest`; the
two experiences were not interchangeable and had no fallback.

## Post-recording editing became the primary workflow

The first-run loop is now **Record or Upload → Review → optional Virtual Try On, Character Swap,
and/or Voice → Download**. Studio still initializes Local Camera mode, but entry alone does not
request camera/microphone permission or start AI. Control-bar and upload-panel recording intents
reuse the stage-owned local lifecycle, then adopt the finalized artifact into the existing-video
editor. Dock-started local preview and live Character/VTO retain the advanced Latest Take flow.

## Characters became reusable, resumable assets

Character creation moved into a fullscreen Builder with one recoverable draft and a journaled,
idempotent save. The Recipe Shelf stores sanitized, versioned character/recipe metadata and opaque
reference relationships. It does not store image or take bytes.

Prompt-only, uploaded-image, image-only, and generated/combined references remain separate choices.
Saving or uploading never implies a billable generation request. A generated preview becomes stale
after relevant edits and cannot silently survive into Save.

## Reference media became immutable and explicit

Uploaded and generated references are immutable, owner-scoped local assets. Detaching a reference,
resetting a draft, or deleting a browser record does not promise byte deletion. Whole-directory
cleanup is safer than introducing unverified orphan garbage collection.

OpenAI, BFL, and Wiro are startup-selected provider passes. They never fall back to one another or
automatically repeat an initial billable submission.

## Live recipe changes became atomic

Pending and applied recipes are distinct. Apply sends one complete prompt/reference/enhancement
snapshot; Revert restores the last successful snapshot; Reset invalidates late work. Local preview
remains on stage until transformed video is actually usable.

## Recording became a bounded handoff

Recording pins its source identity, coalesces duplicate Stop, and finalizes the authoritative video
plus optional sidecar before live/provider cleanup. Playback replaces live media on the same stage.
The product keeps one temporary take, not a take library.

The app owns an independent 270-second warning and 300-second Stop/finalize boundary. The equal
Decart active-session limit and ElevenLabs input limit do not substitute for that recording rule.

Download was initially the only durable handoff. It still does not pretend browser completion is
observable, and confirmed Discard performs the same temporary URL cleanup. Phase 1 later added the
separate local Save Video handoff described above.

## Voice processing preserves the original

Every local or ElevenLabs treatment starts from the immutable original take and sidecar, never a
previous processed result. Replacement is published before the old processed URL is revoked;
failure or cancellation preserves the last valid take.

ElevenLabs discovery was narrowed to saved voices. Browsing, preview, and Apply are explicit,
same-origin provider actions; only Apply sends the audio sidecar. Public discovery, import, voice
creation, and library mutation were removed.

## Existing video joined the take pipeline

Upload became a peer to camera entry without adding a route, player, media library, saved-video
store, or durable job database. Recorded and uploaded sources now enter one temporary layered take:
immutable source, latest successful visual result, optional voiced result, and the presented
highest valid layer.

The initial batch design used exact, server-mediated, asynchronous Lucy and VTO jobs and allowed
each to run once in either order. That chain paused after the first result because Continue was
another billable submission. Status/download/local-finalization retries reused the accepted job,
while a provider submission retry remained a new explicit action.

On 2026-07-30, that ordered-chain design was superseded by a zero-or-one visual policy. The current
workflow keeps Lucy and VTO mutually exclusive, lets the creator switch the one active choice
before submission, and submits only that selected exact model. Start over retains the immutable
source and clears the visual choice before another explicit plan.

The accepted H.264/VP8 subset, 720p result checks, source-audio restoration, 500 ms duration
tolerance, and temporary storage are app-owned conservative policy pending exact-model live and
physical validation.

On 2026-08-03, fixed visual batch submission counters were removed from both browser orchestration
and the loopback broker. Submissions remain explicit, potentially billable actions; the
one-active-job rule and prohibition on automatic billable retry or provider fallback remain
unchanged.

On 2026-08-03, Pruna Character Swap resolution moved from startup environment configuration to a
provider-neutral editor setting. When the active Character Swap capability supports both classes,
the creator chooses `720p` or `1080p` for each explicit submission; the broker validates the choice
and Pruna receives it with that job. Provider selection remains startup-only and hidden.

On 2026-08-07, Pruna Character Swap prompt ownership moved fully to the server. Its provider-neutral
capability now removes prompt and enhancement controls, the browser keeps the recipe prompt empty,
the broker rejects non-empty tampering before provider work, and the adapter always sends one
app-owned identity-replacement instruction. That instruction makes the reference authoritative only
for identity, defining appearance, and worn wardrobe; source-person clothing is replaced instead of
being transferred onto the saved character. Source performance, lip sync, pose, scene, camera,
audio, and every non-worn held or interacted-with item's visibility and motion remain source-owned.
New Character Builder generation also adopted a browser-and-server-enforced swap-ready neutral-gray
staging profile; old uploaded and immutable references remain untouched.

On 2026-08-02, existing-video Character Swap gained a startup-selected Pruna
`p-video-replace` alternative while realtime Character and all VTO work remained on Decart. The
browser/API boundary moved from batch model identifiers to provider-neutral Character Swap/VTO
operation capabilities. Pruna requires one identity reference, disables prompt enhancement, and
uses locally prepared ephemeral H.264 MP4 for compatible MOV/WebM sources. Decart retains exact
Lucy endpoints and 720p output; Pruna exposes separate 720p and 1080p classes. There
is no UI provider selector, fallback, automatic initial retry, or claim that local cleanup deletes
Pruna inputs/results.

## Saved characters gained normalized Wardrobes

On 2026-08-03, character versions became normalized children of one saved parent instead of
duplicated character records. A pure selection resolver now supplies the ordinary prompt, display
label, and exact original/variant image to Studio and Existing Video. Selection is durable only
after successful hydration/use; creating a version never switches the active character
implicitly. The metadata store advanced to v6 with v1-v5 migration, sanitization, parent cascade,
and a 500-record variant cap while detached immutable image bytes retain their existing policy.

Pruna `p-image-try-on` is dedicated to explicit Wardrobe Add Outfit and remains independently
disabled by default. Change Features continues through the startup-selected OpenAI/BFL/Wiro edit
path with optimization off. Both use the same server-mediated immutable reference store, shared
overlay, and no-retry/no-fallback rule; local abort does not claim remote cancellation or deletion.

## Scope remains intentionally local

Accounts, remote hosting, cloud projects, take history, collaboration, sharing, billing, and public
moderation remain outside the current product. The loopback owner hash, device IDs, provider IDs,
and storage paths must never become future user identity.
