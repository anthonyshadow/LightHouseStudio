import { and, eq, inArray, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import type { ProjectRetentionPolicy } from '../../features/projects/project-repository.js';
import type { LightframeDatabase } from './client.js';
import {
  projectAssets,
  projectOutputs,
  projectSources,
  projectVersionReferences,
  videoVersions,
} from './schema.js';

export type ProjectRetentionExecutor =
  LightframeDatabase | Parameters<Parameters<LightframeDatabase['transaction']>[0]>[0];

/** Project tombstones retain lineage, so this policy deliberately has no lifecycle-state filter. */
export class DrizzleProjectRetentionPolicy implements ProjectRetentionPolicy {
  constructor(private readonly db: LightframeDatabase) {}

  async retainsAsset(ownerUserId: string, assetId: string): Promise<boolean> {
    return (await this.retainedAssetIdsWith(this.db, ownerUserId, [assetId])).has(assetId);
  }

  retainedAssetIds(ownerUserId: string, assetIds: readonly string[]): Promise<ReadonlySet<string>> {
    return this.retainedAssetIdsWith(this.db, ownerUserId, assetIds);
  }

  async retainedAssetIdsWith(
    executor: ProjectRetentionExecutor,
    ownerUserId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const candidates = new Set(assetIds);
    if (candidates.size === 0) return new Set();
    const ids = [...candidates];
    const direct = executor
      .selectDistinct({ assetId: projectAssets.assetId })
      .from(projectAssets)
      .where(and(eq(projectAssets.ownerUserId, ownerUserId), inArray(projectAssets.assetId, ids)));
    /*
     * A Project's source bytes are retained while the Project holds that source.
     *
     * Every other arm answers "some revision used this", which the snapshot states. Held source
     * media is different: membership is relational, so the only record of it is the `project_sources`
     * row, and a source the Project holds but has not yet arranged appears in no snapshot. Without
     * these arms such a source has no anchor at all and its bytes are collectable the moment
     * anything asks — a Saved Video deletion today, a sweep later. They can only enlarge the set a
     * caller reads as "do not delete", so adding them cannot lose bytes; they change no answer at
     * all until something writes a second source.
     *
     * Two arms, not three: the pairs below need one for the Version's asset and one for its
     * thumbnail, but a source that borrows a Version stores that Version's asset as its own
     * `assetId` (`project-source-service.ts`, `reuseSavedVideo`), so this arm covers both the owned
     * and the borrowed case and only the thumbnail is left to join for.
     */
    const sourceAssets = executor
      .selectDistinct({ assetId: projectSources.assetId })
      .from(projectSources)
      .where(
        and(eq(projectSources.ownerUserId, ownerUserId), inArray(projectSources.assetId, ids)),
      );
    const sourceVersionThumbnails = executor
      .selectDistinct({ assetId: sql<string>`${videoVersions.thumbnailAssetId}` })
      .from(projectSources)
      .innerJoin(
        videoVersions,
        and(
          eq(videoVersions.videoId, projectSources.savedVideoId),
          eq(videoVersions.ownerUserId, projectSources.ownerUserId),
          eq(videoVersions.id, projectSources.videoVersionId),
        ),
      )
      .where(
        and(
          eq(projectSources.ownerUserId, ownerUserId),
          inArray(videoVersions.thumbnailAssetId, ids),
        ),
      );
    const versionReferenceAssets = executor
      .selectDistinct({ assetId: videoVersions.assetId })
      .from(projectVersionReferences)
      .innerJoin(
        videoVersions,
        and(
          eq(videoVersions.videoId, projectVersionReferences.savedVideoId),
          eq(videoVersions.ownerUserId, projectVersionReferences.ownerUserId),
          eq(videoVersions.id, projectVersionReferences.videoVersionId),
        ),
      )
      .where(
        and(
          eq(projectVersionReferences.ownerUserId, ownerUserId),
          inArray(videoVersions.assetId, ids),
        ),
      );
    const versionReferenceThumbnails = executor
      .selectDistinct({ assetId: sql<string>`${videoVersions.thumbnailAssetId}` })
      .from(projectVersionReferences)
      .innerJoin(
        videoVersions,
        and(
          eq(videoVersions.videoId, projectVersionReferences.savedVideoId),
          eq(videoVersions.ownerUserId, projectVersionReferences.ownerUserId),
          eq(videoVersions.id, projectVersionReferences.videoVersionId),
        ),
      )
      .where(
        and(
          eq(projectVersionReferences.ownerUserId, ownerUserId),
          inArray(videoVersions.thumbnailAssetId, ids),
        ),
      );
    const outputAssets = executor
      .selectDistinct({ assetId: videoVersions.assetId })
      .from(projectOutputs)
      .innerJoin(
        videoVersions,
        and(
          eq(videoVersions.videoId, projectOutputs.savedVideoId),
          eq(videoVersions.ownerUserId, projectOutputs.ownerUserId),
          eq(videoVersions.id, projectOutputs.videoVersionId),
        ),
      )
      .where(and(eq(projectOutputs.ownerUserId, ownerUserId), inArray(videoVersions.assetId, ids)));
    const outputThumbnails = executor
      .selectDistinct({ assetId: sql<string>`${videoVersions.thumbnailAssetId}` })
      .from(projectOutputs)
      .innerJoin(
        videoVersions,
        and(
          eq(videoVersions.videoId, projectOutputs.savedVideoId),
          eq(videoVersions.ownerUserId, projectOutputs.ownerUserId),
          eq(videoVersions.id, projectOutputs.videoVersionId),
        ),
      )
      .where(
        and(
          eq(projectOutputs.ownerUserId, ownerUserId),
          inArray(videoVersions.thumbnailAssetId, ids),
        ),
      );
    const rows = await unionAll(
      direct,
      sourceAssets,
      sourceVersionThumbnails,
      versionReferenceAssets,
      versionReferenceThumbnails,
      outputAssets,
      outputThumbnails,
    );
    return new Set(rows.map(({ assetId }) => assetId));
  }
}
