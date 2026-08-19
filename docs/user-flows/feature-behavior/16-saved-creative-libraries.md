# Creative Assets

## Story

As the authenticated operator, I can browse dedicated Character, Outfit, and Voice libraries
alongside Saved Videos, reuse or remove supported records, and return to creation without losing
the shared Studio runtime.

## Observable behavior

1. **Assets** is the canonical authenticated destination at `/assets`. It launches Videos,
   Characters, Outfits, and Voices only.
2. `/assets/characters`, `/assets/outfits`, and `/assets/voices` render full-screen library
   workspaces inside the existing `StudioApp`; route changes hide rather than remount the media
   stage and contact no provider automatically.
3. Saved Characters retain exact original/variant hydration, Character Builder create/copy/edit,
   Wardrobe, and owner-scoped cleanup. Saved Outfits retain their current browse/use/create/edit
   controls through Outfit Builder.
4. Voices exposes the existing provider catalog and account-saved relationships. The supported
   creation affordance is **Add Voice**; Lightframe does not claim Voice upload, cloning, or
   generation.
5. Characters and Outfits state where the creative library is stored in the current configuration,
   and never claim a cloud copy on a deployment whose creative-library routes are not registered.
6. Characters and Outfits offer **Export library** and **Import library** for the whole creative
   store. Export downloads a versioned JSON file with no dialog and destroys nothing; the file
   lists the reference-image IDs its records depend on and contains no image bytes. Import is
   confirmed destructively, replaces rather than merges, and refuses an oversized, malformed,
   unknown-version or lossy file with a plain message that leaves the existing library untouched.
   A completed import leaves cloud sync running, not paused.
7. Loading, empty, error, pagination, preview, rename/remove, attribution, keyboard, focus,
   Escape/back, and mobile-safe behavior remains owned by each existing library.
8. Recipe has no user-facing route or library. The former Recipe URL redirects to `/assets`, while
   compatibility storage and technical provider contracts remain as documented in
   [the retired UI boundary](06-recipe-shelf.md).

## Ownership and migration

An exported file carries schema v7 records and reference-image IDs only; an import refuses any
other store version rather than migrating it, so a backup is never silently rewritten on the way in.

Creative metadata remains sanitized as schema v7 and namespaced by the stable authenticated user;
the user-scoped and global v6 keys remain rollback inputs after idempotent migration. Neon stores
normalized owner rows behind one library revision and accepts only authenticated owner-derived
full-snapshot CAS writes. Character Builder drafts remain user-scoped browser data. Auth changes
clear in-memory caches. Browser storage never contains the JWT, password, server path, R2 key, or
provider credential.
