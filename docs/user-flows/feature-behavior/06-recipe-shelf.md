# Retired Recipe UI compatibility boundary

Recipe is no longer a user-facing Asset type. There is no Recipe card, count, filter, menu,
dialog, Studio Shelf/Dock control, Quick Create choice, or Recipe route of any kind. The
`/studio/assets/recipes` compatibility redirect has itself been retired: the path is now
unrecognized, like any other unknown URL.

The removal is presentation-only and deliberately non-destructive. Lightframe still retains:

- owner-namespaced saved/recent prompt records required by Character and Outfit workflows;
- IndexedDB v7 and optional relational creative-library parsing/synchronization;
- technical provider `VideoTransformRecipe` request contracts;
- historical Project `recipeId` and `recipeLabel` read compatibility; and
- legacy stored records as rollback/migration inputs.

Those records are never listed as Recipes or backfilled into Project Asset memberships. Current UI
uses **Character**, **Outfit**, **AI settings**, and **configuration** wording. The Prompt
Workshop that once shared this compatibility boundary is itself retired; see the note in
[`../gaps-and-usability-audit.md`](../gaps-and-usability-audit.md).
Deleting or renaming the remaining technical symbols is outside the current migration because it
would break supported persistence, historical snapshots, or provider requests.

Character and Outfit libraries keep their existing owner scoping, reference hydration, Wardrobe,
default Voice, cleanup, and conflict behavior. Project associations point to their stable Asset IDs
without copying these records or changing their independent retention owner.
