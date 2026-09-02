import { z } from 'zod';

/**
 * The creative-library cloud mirror's wire shapes, owned here so the route that validates a
 * replace and the client that reads a snapshot cannot drift apart.
 *
 * `store` stays `z.unknown()` deliberately. The store's deep shape belongs to the domain's
 * `sanitizeCreativeAssetStore`, which both sides already run — a second full schema here would be
 * a third owner of the same rules. The contract owns the envelope; the domain owns the contents.
 */
export const creativeLibraryReplaceRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    store: z.unknown(),
  })
  .strict();

/**
 * What both creative-library responses carry: the GET read and the PUT write each return the full
 * snapshot. `revision` 0 is meaningful only on GET — an owner with no cloud copy yet — and every
 * successful replace returns at least 1, but one schema states the envelope both share rather
 * than splitting a nonnegative and a positive twin.
 */
export const creativeLibrarySnapshotSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    store: z.unknown(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type CreativeLibraryReplaceRequest = z.infer<typeof creativeLibraryReplaceRequestSchema>;
export type CreativeLibrarySnapshot = z.infer<typeof creativeLibrarySnapshotSchema>;
