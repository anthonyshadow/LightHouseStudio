import { and, eq, inArray, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import type { ProjectRetentionPolicy } from '../../features/projects/project-repository.js';
import type { LightframeDatabase } from './client.js';
import {
  projectAssets,
  projectOutputs,
  projectVersionReferences,
  videoVersions,
} from './schema.js';

export type ProjectRetentionExecutor =
  LightframeDatabase | Parameters<Parameters<LightframeDatabase['transaction']>[0]>[0];

/** Project tombstones retain lineage, so this policy deliberately has no lifecycle-state filter. */
export class DrizzleProjectRetentionPolicy implements ProjectRetentionPolicy {
  constructor(private readonly db: LightframeDatabase) {}

  retainsAsset(ownerUserId: string, assetId: string): Promise<boolean> {
    return this.retainsAssetWith(this.db, ownerUserId, assetId);
  }

  retainedAssetIds(ownerUserId: string, assetIds: readonly string[]): Promise<ReadonlySet<string>> {
    return this.retainedAssetIdsWith(this.db, ownerUserId, assetIds);
  }

  async retainsAssetWith(
    executor: ProjectRetentionExecutor,
    ownerUserId: string,
    assetId: string,
  ): Promise<boolean> {
    return (await this.retainedAssetIdsWith(executor, ownerUserId, [assetId])).has(assetId);
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
      versionReferenceAssets,
      versionReferenceThumbnails,
      outputAssets,
      outputThumbnails,
    );
    return new Set(rows.map(({ assetId }) => assetId));
  }
}
