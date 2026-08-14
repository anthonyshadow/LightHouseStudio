import type {
  ProjectAssetLink,
  ProjectRevision,
  ProjectVersionReferenceLink,
} from '@studio/domain';
export { projectMediaReferencesEqual } from '@studio/domain';

export const projectAssetLinksForRevision = (
  revision: ProjectRevision,
): readonly ProjectAssetLink[] => {
  const references: Array<Pick<ProjectAssetLink, 'assetId' | 'role'>> = [];
  if (revision.snapshot.sourceAssetId !== null) {
    references.push({ assetId: revision.snapshot.sourceAssetId, role: 'source' });
  }
  if (revision.snapshot.workingMedia?.kind === 'asset') {
    references.push({ assetId: revision.snapshot.workingMedia.assetId, role: 'working' });
  }
  if (revision.snapshot.presentedMedia?.kind === 'asset') {
    references.push({ assetId: revision.snapshot.presentedMedia.assetId, role: 'presented' });
  }
  for (const assetId of [
    revision.snapshot.selectedCharacter?.referenceAssetId,
    revision.snapshot.selectedOutfit?.referenceAssetId,
    revision.snapshot.creativeIntent.referenceAssetId,
  ]) {
    if (assetId !== null && assetId !== undefined) references.push({ assetId, role: 'reference' });
  }

  const uniqueReferences = new Map(
    references.map((reference) => [`${reference.role}:${reference.assetId}`, reference]),
  );
  return [...uniqueReferences.values()].map(({ assetId, role }) => ({
    projectId: revision.projectId,
    ownerUserId: revision.ownerUserId,
    assetId,
    role,
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    createdAt: revision.createdAt,
  }));
};

export const projectVersionReferenceLinksForRevision = (
  revision: ProjectRevision,
): readonly ProjectVersionReferenceLink[] => {
  const links: ProjectVersionReferenceLink[] = [];
  for (const [role, reference] of [
    ['working', revision.snapshot.workingMedia],
    ['presented', revision.snapshot.presentedMedia],
  ] as const) {
    if (reference?.kind !== 'saved-video-version') continue;
    links.push({
      projectId: revision.projectId,
      ownerUserId: revision.ownerUserId,
      savedVideoId: reference.savedVideoId,
      videoVersionId: reference.videoVersionId,
      role,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      createdAt: revision.createdAt,
    });
  }
  return links;
};
