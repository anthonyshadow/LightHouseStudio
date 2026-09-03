# Libraries

## Story

As the authenticated operator, I can browse dedicated Character, Outfit, and Voice libraries
alongside Videos, reuse or remove supported records, and return to creation without losing
the shared Studio runtime.

## Observable behavior

1. **Assets** opens the most recently used Videos, Characters, Outfits, or Voices library directly,
   defaulting to Videos. `/assets` is a compatibility entry that replaces to that destination; it
   is not a card hub.
2. `/assets/characters`, `/assets/outfits`, and `/assets/voices` render full-screen library
   overlays inside the authenticated shell. Asset routes own no media stage or capture runtime and
   contact no provider automatically. Their shared tabs replace the pathname, and close consumes
   the entry that opened Assets.
3. Saved Characters retain exact original/variant hydration, Character Builder create/copy/edit,
   Wardrobe, and owner-scoped cleanup. Saved Outfits retain their current browse/use/create/edit
   controls through Outfit Builder.
4. Voices exposes the existing provider catalog and account-saved relationships. The supported
   creation affordance is **Add Voice**; Lightframe does not claim Voice upload, cloning, or
   generation.
5. Characters and Outfits load from the authenticated account snapshot wherever relational account
   persistence is configured. The UI says they are available wherever the account signs in and
   never describes the production library as tied to one device. A local-only development
   configuration states that account sync is unavailable rather than claiming persistence it lacks.
6. Characters and Outfits put whole-library **Export library** and **Import library** behind the
   shared creative-library overflow. Export downloads a versioned JSON file with no dialog and
   destroys nothing; the file lists the reference-image IDs its records depend on and contains no
   image bytes. Import is confirmed destructively, replaces rather than merges, and refuses an
   oversized, malformed, unknown-version or lossy file with a plain message that leaves the existing
   library untouched. A completed import leaves account sync running, not paused.
7. Loading, empty, error, pagination, preview, rename/remove, attribution, keyboard, focus,
   Escape/back, and mobile-safe behavior remains owned by each existing library.
8. Recipe has no user-facing route or library. The former Recipe URL is unknown and falls through
   to the entry route, while compatibility storage and technical provider contracts remain as documented in
   [the retired UI boundary](06-recipe-shelf.md).

## Ownership and migration

An exported file carries schema v7 records and reference-image IDs only; an import refuses any
other store version rather than migrating it, so a backup is never silently rewritten on the way in.

Creative metadata remains sanitized as schema v7 and namespaced by the stable authenticated user;
the user-scoped and global v6 keys remain rollback inputs after idempotent cache migration. Neon is
the durable production authority: it stores normalized owner rows behind one library revision and
accepts only authenticated owner-derived full-snapshot CAS writes. IndexedDB is the local-first
cache and configured local-development fallback. Character Builder drafts remain user-scoped local
data. Auth changes clear in-memory caches. Client storage never contains the JWT, password, server
path, R2 key, or provider credential.
