# Project lifecycle and immutable source

## Story

As the authenticated operator, I can create and manage Projects from one canonical workspace,
accept one durable video original, reopen the same Project/source by URL, and resolve concurrent
metadata or source changes without unsafe overwrite or implicit provider work.

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

## Boundaries

This story adds no Campaign expansion, Project autosave, creative integration, processing, output
save, Version-history UI, browser Project authority, or IndexedDB Project data. Project source
selection starts no provider. The standalone existing-video workflow remains tab-temporary unless
its result is separately saved. Project server/repository authority, retention, and cleanup remain
as documented in Architecture.
