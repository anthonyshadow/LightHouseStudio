import type {
  ProjectAssetLink,
  ProjectMediaReference,
  ProjectOutputReference,
  ProjectRevision,
  ProjectSnapshot,
  ProjectVersionReferenceLink,
} from '@studio/domain';
export { projectMediaReferencesEqual } from '@studio/domain';

/** What a Project holds right now, with the pointers it has not set dropped. */
export const projectHeldMedia = (
  snapshot: Pick<ProjectSnapshot, 'workingMedia' | 'presentedMedia'>,
): readonly ProjectMediaReference[] =>
  [snapshot.workingMedia, snapshot.presentedMedia].filter(
    (reference): reference is ProjectMediaReference => reference !== null,
  );

/**
 * The Saved Video Version that best represents a Project right now, or nothing.
 *
 * What the operator is looking at wins over what they last produced, so a Project whose current cut
 * came from a Version shows that Version rather than an older output. A locally rendered cut that
 * was never saved has no Version to point at, and honestly has no poster.
 */
export const projectPosterReferenceForSnapshot = (
  snapshot: Pick<ProjectSnapshot, 'presentedMedia' | 'lastSuccessfulOutput'>,
): ProjectOutputReference | null => {
  const presented = snapshot.presentedMedia;
  if (presented?.kind === 'saved-video-version') {
    return { savedVideoId: presented.savedVideoId, videoVersionId: presented.videoVersionId };
  }
  return snapshot.lastSuccessfulOutput;
};

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
