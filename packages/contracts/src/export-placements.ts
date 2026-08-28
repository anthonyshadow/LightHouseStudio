import { z } from 'zod';

/**
 * The placement a video is produced for.
 *
 * It lives in its own module because both a Project's revision snapshot and a Saved Video's
 * Version now state one, and `saved-videos` cannot import `projects` — that edge already runs the
 * other way for the title rules.
 */
export const projectExportSpecificationValueSchema = z
  .object({
    container: z.literal('video/mp4'),
    aspect: z.enum(['source', '16:9', '9:16', '1:1', '4:5']),
    resolution: z
      .object({
        width: z.number().int().positive().max(16_384),
        height: z.number().int().positive().max(16_384),
      })
      .strict()
      .nullable(),
    includeAudio: z.boolean(),
  })
  .strict();

export type ProjectExportSpecificationValue = z.infer<typeof projectExportSpecificationValueSchema>;
