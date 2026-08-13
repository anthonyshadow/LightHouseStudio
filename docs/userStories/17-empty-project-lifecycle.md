# Project lifecycle, creative checkpoints, and durable working media

## Story

As the authenticated operator, I can create and manage Projects from one canonical workspace,
accept one durable video original, reopen the same Project/source by URL, and resolve concurrent
metadata, creative, edit, source, or working-media changes without unsafe overwrite or implicit
provider work.

## Observable behavior

1. **Projects** is a primary destination in the existing authenticated Studio chrome.
   `/studio/projects` lists bounded active and archived summaries; `/studio/projects/:projectId`
   opens one Project. Both routes are protected, deep-linkable, and return to the same URL after
   Login. Existing `/studio`, Saved Videos, Saved Characters, and Saved Outfits routes remain
   canonical.
2. **Quick Start** creates `Untitled Project` without requiring a Campaign, brief, source, tag, or
   provider choice. The browser supplies one operation key for the action and reuses it after an
   uncertain response so the server's durable receipt can reconcile an exact replay.
3. Summary rows show only title, derived Project status, and updated time. Active and archived
   queries are separate, cursor-bounded pages. Loading, empty, safe-error/retry, and explicit
   **Load more** states do not fetch snapshots, media, history, bytes, storage data, or provider
   details.
4. Open, rename, archive, and restore use owner-derived API behavior and Project-version CAS.
   Dialogs expose busy/error state, restore useful focus, and announce results. Archive removes a
   Project from the active list without deleting its history; restore returns it.
5. A stale rename never overwrites server state. The dialog keeps the proposed name and requires
   **Reload and retry rename** or **Discard change**. Reload fetches current server authority;
   response-loss replay is reconciled when the requested result is already current.
6. Refreshing or directly opening an empty Project fetches its identity and current revision from
   server authority. The detail truthfully says **No source yet** and offers **Record**, **Upload**,
   and **Use Saved Video** without a wizard. Upload previews immediately on the existing stage;
   Record starts local media only after the explicit action and offers a finalized take for
   acceptance; Use Saved Video selects the current exact active Version.
7. `StudioApp` remains the sole authenticated composition root and owns the one mounted media
   stage. Project list and Campaign routes hide it; an open Project reuses it beside Project source
   controls rather than mounting another Studio, player, media session, object-URL owner, shell, or
   Project store.
8. Active Project identity is URL-owned. **Studio** navigation and global-library navigation are
   labelled as Project-context exits. Refreshing `/studio/videos`, `/studio/characters`, or
   `/studio/outfits` restores that global library and cannot resurrect the prior Project from
   mounted React state.
9. The UI distinguishes **Preparing source**, **Saving changes**, **All changes saved**,
   **Conflict**, and safe failure. A Project becomes resumable only after durable byte storage or
   exact Version verification, server inspection, checksum/owner validation, and atomic source
   revision acceptance. A failed/unaccepted staging attempt can be replaced.
10. The first accepted source is the immutable original. A different accepted original requires a
    new Project. Exact Saved Video Version reuse references existing bytes and used-by lineage; it
    does not claim that the Project produced that Version or infer a later Add Version target.
11. Accepted source metadata exposes only normalized media facts and a controlled Project content
    URL. Owner-checked range/HEAD content rehydrates a fresh Blob through the existing recording
    artifact owner after navigation, browser refresh/restart, or app restart. Blob/data URLs,
    checksums, storage paths/keys, and provider bodies remain private.
12. Recording/finalization blocks Project switching until safe. Upload/inspection/acceptance and a
    finalized unaccepted take require explicit stay or abort/discard. Every operation remains bound
    to its initiating Project, and an old Project's late completion cannot replace the new stage.
13. One feature-local Project session hydrates only from the Project ID in the canonical URL. It
    publishes current server authority to the source controller without owning the Blob, object
    URL, stage, recording, or render lifecycle. Leaving for a global library unmounts that session;
    refreshing the library URL cannot recover a hidden Project identity.
14. The session exposes one typed semantic-proposal port. Proposals contain workflow phase, exact
    applied creative/Voice/treatment values, explicit live metadata, and validated local edit; the
    immutable source and current media references are copied from server authority. Compatible
    proposals coalesce for 750 ms and append one revision rather than one revision per input event.
    **Saving changes** and **All changes saved** describe this server checkpoint only.
15. A stale Project/revision CAS or unavailable response preserves the current tab's proposal and
    reloads server authority. If authority already contains the exact proposal, the lost response
    converges without another revision. Otherwise **Conflict** requires explicit **Reapply
    changes** or **Discard local changes**; Lightframe does not merge or overwrite automatically.
16. Project-to-Project switches, Project-to-library exits, back/forward, and logout first flush the
    Project session. Failed/conflicted saves stay on the source URL until retry or explicit discard.
    Refresh/unload receives the browser warning while a proposal is dirty or saving. No Project
    IndexedDB store is activated: a browser crash, forced unload, or confirmed reload can lose only
    the pending in-memory proposal, never a server-accepted revision or source.
17. The existing creative rail remains available beside one source-bearing Project stage. Character
    and Variant, Outfit, prompt/recipe, one visual treatment, optional local/saved Voice, capture
    metadata, and validated local edit map through feature-local adapters into the same Project
    session. **Save creative setup** is an explicit semantic boundary; keystrokes, frames, slider
    ticks, and undo/redo entries never append revisions.
18. Snapshot v2 records stable resource IDs plus only exact applied labels, child/reference IDs,
    prompt/treatment/settings, and resource revisions needed to explain the checkpoint. The V1 read
    migration maps unavailable provenance to null rather than inventing it. Reusable records and
    their bytes/lifecycles stay independently owned.
19. Owner-scoped hydration restores only exact compatible resources. Missing, tombstoned,
    wrong-owner, or changed records keep the historical applied label/explanation and show
    **Choose another** without failing the source or revealing whether another owner has that ID.
20. **Render preview** is temporary. **Adopt as working media** accepts a validated local render or
    exact same-owner ready Media Asset/Saved Video Version, flushes the session, verifies both CAS
    tokens and one operation-key fingerprint, and appends working/presented lineage. It never
    changes the immutable source, copies exact retained media unnecessarily, infers Add Version,
    or creates Project output provenance. Exact replay retains the original adoption revision ID,
    number, media, and receipt while also reporting the current Project revision; changed replay
    conflicts.
21. A material creative/edit/working-media checkpoint clears a stale `lastSuccessfulOutput` and
    returns status to current ready/attempt truth. Completing a local render or adoption alone does
    not make the Project `completed`. Saving setup, temporary rendering, and durable working-media
    readiness use distinct status copy.
22. Project Character/VTO/ElevenLabs provider-backed Start actions remain gated with explanatory
    UI. Configuration and the local render/adoption path make no provider call. Backend authority
    now pre-links a direct Project processing command, reconnects durable visual-provider jobs,
    exposes ambiguity/explicit retry truth, and retains current or stale results safely, but Prompt
    10 owns the visible integration. Provider-backed Voice remains unavailable there because its
    synchronous response has no durable reconnect identity. Rendering or working-media adoption
    blocks Project switching/exit until it completes or returns to a safe cancellable checkpoint.

## Boundaries

This story includes bounded semantic creative/edit checkpoints and working-media adoption, but no
Campaign expansion, Project provider processing/reconnect/retry UI, Saved Video output save, Version-history
UI, browser Project authority, or IndexedDB Project data. Project source selection, session
hydration, configuration, and local adoption start no provider. Standalone existing-video behavior
retains its separate save/replace contract. Project server/repository authority, retention, and
cleanup remain as documented in Architecture.
