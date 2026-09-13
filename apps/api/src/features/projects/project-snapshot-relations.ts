import type {
  ProjectAssetLink,
  ProjectMediaReference,
  ProjectOutputReference,
  ProjectRevision,
  ProjectSnapshot,
  ProjectVersionReferenceLink,
} from '@studio/domain';
import { projectTransformOf } from '@studio/domain';
export { projectMediaReferencesEqual } from '@studio/domain';

/**
 * What a Project holds right now, with the pointers it has not set dropped: the current cut, and
 * every piece of media its composition arranges.
 */
export const projectHeldMedia = (
  snapshot: Pick<ProjectSnapshot, 'workingMedia' | 'presentedMedia' | 'composition'>,
): readonly ProjectMediaReference[] =>
  [
    snapshot.workingMedia,
    snapshot.presentedMedia,
    ...(snapshot.composition?.clips.map((clip) => clip.media) ?? []),
  ].filter((reference): reference is ProjectMediaReference => reference !== null);

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
  // A clip's media is held by the revision that arranges it, so retention keeps its bytes for
  // as long as the arrangement is history — the same guarantee the working pointers carry.
  for (const clip of revision.snapshot.composition?.clips ?? []) {
    if (clip.media.kind === 'asset') references.push({ assetId: clip.media.assetId, role: 'clip' });
  }
  const transform = projectTransformOf(revision.snapshot);
  for (const assetId of [
    transform.selectedCharacter?.referenceAssetId,
    transform.selectedOutfit?.referenceAssetId,
    transform.creativeIntent.referenceAssetId,
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
  const seen = new Set<string>();
  for (const [role, reference] of [
    ['working', revision.snapshot.workingMedia],
    ['presented', revision.snapshot.presentedMedia],
    ...(revision.snapshot.composition?.clips.map((clip) => ['clip', clip.media] as const) ?? []),
  ] as const) {
    if (reference?.kind !== 'saved-video-version') continue;
    // Two clips over the same Version are one used-by relation, which is also the row's key.
    const key = `${role}:${reference.savedVideoId}:${reference.videoVersionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
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
