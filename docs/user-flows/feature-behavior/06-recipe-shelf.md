# Retired Recipe UI compatibility boundary

Recipe is no longer a user-facing Asset type. There is no Recipe card, count, filter, menu,
dialog, Studio Shelf/Dock control, Quick Create choice, or canonical Recipe route. Requests for
the former `/studio/assets/recipes` location replace-navigate to `/assets`.

The removal is presentation-only and deliberately non-destructive. Lightframe still retains:

- owner-namespaced saved/recent prompt records required by Character and Outfit workflows;
- IndexedDB v7 and optional relational creative-library parsing/synchronization;
- technical provider `VideoTransformRecipe` request contracts;
- historical Project `recipeId` and `recipeLabel` read compatibility; and
- legacy stored records as rollback/migration inputs.

Those records are never listed as Recipes or backfilled into Project Asset memberships. Current UI
uses **Character**, **Outfit**, **AI settings**, **configuration**, and **Prompt Workshop** wording.
Deleting or renaming the remaining technical symbols is outside the current migration because it
would break supported persistence, historical snapshots, or provider requests.

Character and Outfit libraries keep their existing owner scoping, reference hydration, Wardrobe,
default Voice, cleanup, and conflict behavior. Project associations point to their stable Asset IDs
without copying these records or changing their independent retention owner.
