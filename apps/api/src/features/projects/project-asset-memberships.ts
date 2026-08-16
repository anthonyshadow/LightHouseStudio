import { createHash } from 'node:crypto';
import {
  createProjectAssetMembership,
  type Project,
  type ProjectAssetKind,
  type ProjectAssetMembership,
  type ProjectOutputLink,
  type ProjectRevision,
} from '@studio/domain';
import type {
  AppendProjectRevisionPersistenceInput,
  ProjectSourceRecord,
  ProjectWorkingMediaRecord,
} from './project-repository.js';

interface MembershipCandidate {
  readonly kind: ProjectAssetKind;
  readonly resourceId: string;
  readonly createdAt: string;
}

interface MembershipBackfillSource {
  readonly project: Project;
  readonly revisions: readonly ProjectRevision[];
  readonly outputLinks: readonly ProjectOutputLink[];
  readonly source?: ProjectSourceRecord | null;
  readonly workingMediaAdoptions?: readonly ProjectWorkingMediaRecord[];
}

const candidateKey = ({ kind, resourceId }: Pick<MembershipCandidate, 'kind' | 'resourceId'>) =>
  `${kind}:${resourceId}`;

const candidatesForRevision = (revision: ProjectRevision): readonly MembershipCandidate[] => {
  const candidates: MembershipCandidate[] = [];
  for (const media of [revision.snapshot.workingMedia, revision.snapshot.presentedMedia]) {
    if (media?.kind === 'saved-video-version') {
      candidates.push({
        kind: 'video',
        resourceId: media.savedVideoId,
        createdAt: revision.createdAt,
      });
    }
  }
  if (revision.snapshot.lastSuccessfulOutput !== null) {
    candidates.push({
      kind: 'video',
      resourceId: revision.snapshot.lastSuccessfulOutput.savedVideoId,
      createdAt: revision.createdAt,
    });
  }
  if (revision.snapshot.selectedCharacter !== null) {
    candidates.push({
      kind: 'character',
      resourceId: revision.snapshot.selectedCharacter.characterId,
      createdAt: revision.createdAt,
    });
  }
  if (revision.snapshot.selectedOutfit !== null) {
    candidates.push({
      kind: 'outfit',
      resourceId: revision.snapshot.selectedOutfit.outfitId,
      createdAt: revision.createdAt,
    });
  }
  if (revision.snapshot.selectedVoice?.kind === 'saved-voice') {
    candidates.push({
      kind: 'voice',
      resourceId: revision.snapshot.selectedVoice.voiceId,
      createdAt: revision.createdAt,
    });
  }
  return candidates;
};

/** Stable UUID used only for deterministic persistence migrations and retry-safe relation upserts. */
export const deterministicProjectAssetMembershipId = (
  ownerUserId: string,
  projectId: string,
  kind: ProjectAssetKind,
  resourceId: string,
): string => {
  const bytes = createHash('sha256')
    .update(`lightframe:project-asset-membership:${ownerUserId}:${projectId}:${kind}:${resourceId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const createSavedVideoProjectMembership = (input: {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly savedVideoId: string;
  readonly createdAt: string;
  readonly id?: string;
}): ProjectAssetMembership =>
  createProjectAssetMembership({
    id:
      input.id ??
      deterministicProjectAssetMembershipId(
        input.ownerUserId,
        input.projectId,
        'video',
        input.savedVideoId,
      ),
    projectId: input.projectId,
    ownerUserId: input.ownerUserId,
    kind: 'video',
    resourceId: input.savedVideoId,
    createdAt: input.createdAt,
  });

export const deriveProjectAssetMemberships = (
  input: MembershipBackfillSource,
): readonly ProjectAssetMembership[] => {
  const candidates: MembershipCandidate[] = input.revisions.flatMap(candidatesForRevision);
  if (input.source?.savedVideoId !== null && input.source?.savedVideoId !== undefined) {
    candidates.push({
      kind: 'video',
      resourceId: input.source.savedVideoId,
      createdAt: input.source.acceptedAt,
    });
  }
  for (const media of input.workingMediaAdoptions ?? []) {
    if (media.savedVideoId !== null) {
      candidates.push({
        kind: 'video',
        resourceId: media.savedVideoId,
        createdAt: media.adoptedAt,
      });
    }
  }
  for (const output of input.outputLinks) {
    candidates.push({
      kind: 'video',
      resourceId: output.savedVideoId,
      createdAt: output.createdAt,
    });
  }

  const earliestByKey = new Map<string, MembershipCandidate>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const current = earliestByKey.get(key);
    if (current === undefined || candidate.createdAt < current.createdAt) {
      earliestByKey.set(key, candidate);
    }
  }

  return [...earliestByKey.values()]
    .sort((left, right) =>
      left.createdAt === right.createdAt
        ? candidateKey(left).localeCompare(candidateKey(right))
        : left.createdAt.localeCompare(right.createdAt),
    )
    .map((candidate) =>
      createProjectAssetMembership({
        id: deterministicProjectAssetMembershipId(
          input.project.ownerUserId,
          input.project.id,
          candidate.kind,
          candidate.resourceId,
        ),
        projectId: input.project.id,
        ownerUserId: input.project.ownerUserId,
        ...candidate,
      }),
    );
};

/** Memberships a revision append persists: those the revision introduces plus any explicit extras. */
export const membershipsForRevisionInput = (
  input: AppendProjectRevisionPersistenceInput,
): readonly ProjectAssetMembership[] => [
  ...membershipsIntroducedByRevision(input.revision),
  ...(input.assetMemberships ?? []),
];

export const membershipsIntroducedByRevision = (
  revision: ProjectRevision,
): readonly ProjectAssetMembership[] =>
  candidatesForRevision(revision).map((candidate) =>
    createProjectAssetMembership({
      id: deterministicProjectAssetMembershipId(
        revision.ownerUserId,
        revision.projectId,
        candidate.kind,
        candidate.resourceId,
      ),
      projectId: revision.projectId,
      ownerUserId: revision.ownerUserId,
      ...candidate,
    }),
  );
