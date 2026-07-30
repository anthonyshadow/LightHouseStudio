# Product evolution

This file preserves durable rationale for intentional product changes. Current behavior belongs in
[Architecture](ARCHITECTURE.md) and the [observable user stories](userStories/README.md).

## Entry became separate from the Studio runtime

Studio originally rendered directly at `/`, and every retired or unknown path canonicalized to
that same runtime. The application now keeps a minimal provider-free entry at `/` and lazy-loads
the one Studio runtime at `/studio`. Known retired Studio links still reach `/studio`; unknown
paths return to the entry instead of bypassing it. Browser-local data needs no migration because
its ownership is origin-scoped, not path-scoped.

Browser Back and Forward hand focus between Enter and the Studio main landmark. Recording and
finalization cannot be abandoned by routing; temporary take, Voice, and dirty Shelf work requires
confirmed discard. This routing layer does not authorize public deployment.

## One Studio replaced parallel journeys

`/studio` is the sole media runtime. Legacy project links may open the compatibility manager but
never revive Guided.

One persistent media stage now owns preview, transformed video, recording, finalization, and
playback. Dock, Capture Settings, Workshop, Shelf, Character Builder, Take Review, Voice, and
Legacy Projects are overlays. This avoided parallel media sessions, modal systems, and stores.

## Local preview precedes provider work

The primary path became **Start Camera + Mic → Start AI**. Drafting, uploads, saved-character
selection, and local capture do not require provider credentials, SDK loading, token minting, or
external media traffic. Provider contact remains explicit and cost-sensitive.

Character uses the exact `lucy-2.5` model. VTO remains a separate, secondary beta pinned to
`lucy-vton-3`; the two experiences are not interchangeable and have no fallback.

## Characters became reusable, resumable assets

Character creation moved into a fullscreen Builder with one recoverable draft and a journaled,
idempotent save. The Recipe Shelf stores sanitized, versioned character/recipe metadata and opaque
reference relationships. It does not store image or take bytes.

Prompt-only, uploaded-image, image-only, and generated/combined references remain separate choices.
Saving or uploading never implies a billable generation request. A generated preview becomes stale
after relevant edits and cannot silently survive into Save.

## Reference media became immutable and explicit

Uploaded and generated references are immutable, owner-scoped local assets. Detaching a reference,
resetting a draft, or deleting a browser record does not promise byte deletion. The controlled
pilot therefore uses isolated participant environments and verified whole-environment retirement
instead of unsafe orphan garbage collection.

OpenAI, BFL, and Wiro are startup-selected provider passes. They never fall back to one another or
automatically repeat an initial billable submission. Wiro is operator qualification only.

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

Download is the durable handoff. It enables the Release actions but does not pretend browser
download completion is observable. Confirmed Discard performs the same URL cleanup without a
download.

## Voice processing preserves the original

Every local or ElevenLabs treatment starts from the immutable original take and sidecar, never a
previous processed result. Replacement is published before the old processed URL is revoked;
failure or cancellation preserves the last valid take.

ElevenLabs discovery was narrowed to saved voices. Browsing, preview, and Apply are explicit,
same-origin provider actions; only Apply sends the audio sidecar. Public discovery, import, voice
creation, and library mutation were removed.

## Scope remains intentionally local

Accounts, remote hosting, cloud projects, take history, collaboration, sharing, billing, and public
moderation remain outside the current product. The loopback owner hash, device IDs, provider IDs,
and storage paths must never become future user identity.
