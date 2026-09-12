import {
  projectExportSpecificationValueSchema,
  projectMediaReferenceSchema,
} from '@studio/contracts';
import {
  isRecord,
  projectMediaReferencesEqual,
  type ProjectExportSpecification,
  type ProjectMediaReference,
} from '@studio/domain';
import { createVersionedRecordStore } from '../../persistence/versionedRecord';

export type ProjectOutputRenditionOutcome = 'pending' | 'stored' | 'failed' | 'cancelled';

export interface ProjectOutputRenditionMember {
  readonly specification: ProjectExportSpecification;
  /**
   * Minted before the first render and never regenerated, because on the server this key *determines*
   * the asset id: an attempt that resumes after a reload re-uploads under the same key and gets the
   * bytes already stored instead of leaving a second copy behind.
   */
  readonly operationKey: string;
  readonly outcome: ProjectOutputRenditionOutcome;
  /** Set once the bytes are durably stored, which is what lets a resume skip this member. */
  readonly assetId: string | null;
  /** Why this member was not made, in the words the operator already saw. */
  readonly reason: string | null;
}

export interface ProjectOutputRenditionPreparation {
  /**
   * The attempt that owns this record. Every update and the clear compare it first, so a second
   * tab running its own loop never overwrites or deletes this one's — that tab keeps its members
   * in memory and its save is refused by the Project's own version check, as it already would be.
   */
  readonly attemptId: string;
  readonly projectId: string;
  /**
   * What the attempt was started against. When any of it has moved, the stored members describe
   * bytes made from a cut this save is no longer about, and the record is discarded.
   */
  readonly basis: {
    readonly expectedVersion: number;
    readonly expectedRevisionNumber: number;
    readonly media: ProjectMediaReference;
  };
  /** The set these placements belong to, when this attempt is adding to one that exists. */
  readonly variantSetId: string | null;
  readonly members: readonly ProjectOutputRenditionMember[];
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const parseMember = (value: unknown): ProjectOutputRenditionMember | null => {
  if (!isRecord(value)) return null;
  const specification = projectExportSpecificationValueSchema.safeParse(value['specification']);
  const outcome = value['outcome'];
  const assetId = value['assetId'];
  const reason = value['reason'];
  if (
    !specification.success ||
    typeof value['operationKey'] !== 'string' ||
    !uuidPattern.test(value['operationKey']) ||
    (outcome !== 'pending' &&
      outcome !== 'stored' &&
      outcome !== 'failed' &&
      outcome !== 'cancelled') ||
    (assetId !== null && (typeof assetId !== 'string' || !uuidPattern.test(assetId))) ||
    (reason !== null && typeof reason !== 'string')
  ) {
    return null;
  }
  // A member that says it is stored without naming the bytes cannot be skipped on a resume, and
  // trusting it would silently drop a placement from the save.
  if (outcome === 'stored' && assetId === null) return null;
  return {
    specification: specification.data,
    operationKey: value['operationKey'],
    outcome,
    assetId,
    reason,
  };
};

/**
 * What one save attempt has already made, so a reload never re-renders or re-uploads a placement
 * that is finished.
 *
 * Separate from the pending save receipt on purpose: the receipt exists only once every placement
 * has been produced, and for a set that moment can be minutes after the first upload landed. This
 * record covers exactly that gap, and is cleared the moment the receipt takes over.
 */
export const projectOutputRenditionPreparationStore = (projectId: string) =>
  createVersionedRecordStore<ProjectOutputRenditionPreparation>({
    storageBase: `lightframe.project-output-renditions.${projectId}`,
    version: 1,
    parse: (payload) => {
      if (!isRecord(payload)) return null;
      const basis = payload['basis'];
      if (
        typeof payload['attemptId'] !== 'string' ||
        !uuidPattern.test(payload['attemptId']) ||
        payload['projectId'] !== projectId ||
        !isRecord(basis) ||
        typeof basis['expectedVersion'] !== 'number' ||
        !Number.isInteger(basis['expectedVersion']) ||
        typeof basis['expectedRevisionNumber'] !== 'number' ||
        !Number.isInteger(basis['expectedRevisionNumber']) ||
        !Array.isArray(payload['members']) ||
        payload['members'].length === 0 ||
        (payload['variantSetId'] !== null && typeof payload['variantSetId'] !== 'string')
      ) {
        return null;
      }
      // The wire schema already says what a media reference is; a second hand-written parser here
      // would be a second answer to that question, and a looser one.
      const media = projectMediaReferenceSchema.safeParse(basis['media']);
      const members: ProjectOutputRenditionMember[] = [];
      for (const candidate of payload['members']) {
        const member = parseMember(candidate);
        if (member === null) return null;
        members.push(member);
      }
      if (!media.success) return null;
      return {
        attemptId: payload['attemptId'],
        projectId,
        basis: {
          expectedVersion: basis['expectedVersion'],
          expectedRevisionNumber: basis['expectedRevisionNumber'],
          media: media.data,
        },
        variantSetId: payload['variantSetId'],
        members,
      };
    },
  });

/** Whether a stored attempt was made against the Project as it stands now. */
export const preparationMatchesBasis = (
  preparation: ProjectOutputRenditionPreparation,
  latest: {
    readonly expectedVersion: number;
    readonly expectedRevisionNumber: number;
    readonly media: ProjectMediaReference | null;
  },
): boolean =>
  preparation.basis.expectedVersion === latest.expectedVersion &&
  preparation.basis.expectedRevisionNumber === latest.expectedRevisionNumber &&
  // The domain's own rule rather than a stringify: a reference whose keys serialize in another
  // order is the same reference, and calling it a different one throws away a resumable attempt.
  projectMediaReferencesEqual(preparation.basis.media, latest.media);
