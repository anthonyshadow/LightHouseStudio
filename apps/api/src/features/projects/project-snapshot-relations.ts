import type {
  ProjectAssetLink,
  ProjectMediaReference,
  ProjectOutputReference,
  ProjectRevision,
  ProjectSnapshot,
  ProjectVersionReferenceLink,
  ProjectVersionReferenceRole,
} from '@studio/domain';
import { projectTransformOf } from '@studio/domain';
export { projectMediaReferencesEqual } from '@studio/domain';

type HeldMedia = readonly [ProjectVersionReferenceRole, ProjectMediaReference];

/**
 * What a Project holds right now and why, with the pointers it has not set dropped: the current
 * cut, what it presents, and every piece of media its composition arranges.
 *
 * One enumeration, because three callers need the same list and a media slot added to the snapshot
 * has to reach all of them. The roles are the ones a used-by relation records; the asset links
 * below borrow them unchanged, which is why they are named here rather than at each call site.
 */
export const projectHeldMediaByRole = (
  snapshot: Pick<ProjectSnapshot, 'workingMedia' | 'presentedMedia' | 'composition'>,
): readonly HeldMedia[] =>
  (
    [
      ['working', snapshot.workingMedia],
      ['presented', snapshot.presentedMedia],
      ...(snapshot.composition?.clips.map((clip) => ['clip', clip.media] as const) ?? []),
    ] as const
  ).filter((held): held is HeldMedia => held[1] !== null);

export const projectHeldMedia = (
  snapshot: Pick<ProjectSnapshot, 'workingMedia' | 'presentedMedia' | 'composition'>,
): readonly ProjectMediaReference[] =>
  projectHeldMediaByRole(snapshot).map(([, reference]) => reference);

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
  // A clip's media is held by the revision that arranges it, so retention keeps its bytes for as
  // long as the arrangement is history — the same guarantee the working pointers carry.
  for (const [role, media] of projectHeldMediaByRole(revision.snapshot)) {
    if (media.kind === 'asset') references.push({ assetId: media.assetId, role });
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
  const links = new Map<string, ProjectVersionReferenceLink>();
  for (const [role, reference] of projectHeldMediaByRole(revision.snapshot)) {
    if (reference.kind !== 'saved-video-version') continue;
    // Two clips over the same Version are one used-by relation, which is also the row's key.
    links.set(`${role}:${reference.savedVideoId}:${reference.videoVersionId}`, {
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
  return [...links.values()];
};
