import type {
  Project,
  ProjectAggregate,
  ProjectAssetLink,
  ProjectConflict,
  ProjectJobLink,
  ProjectOutputLink,
  ProjectRevision,
} from '@studio/domain';

export type ProjectPersistenceMutationResult =
  | { readonly kind: 'updated' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict'; readonly conflict: ProjectConflict };

export interface AppendProjectRevisionPersistenceInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly nextProject: Project;
  readonly revision: ProjectRevision;
  readonly assetLinks: readonly ProjectAssetLink[];
}

export interface ProjectRepository {
  create(aggregate: ProjectAggregate): Promise<void>;
  get(ownerUserId: string, projectId: string): Promise<ProjectAggregate | null>;
  appendRevision(
    input: AppendProjectRevisionPersistenceInput,
  ): Promise<ProjectPersistenceMutationResult>;
  updateMetadata(
    ownerUserId: string,
    expectedVersion: number,
    nextProject: Project,
  ): Promise<ProjectPersistenceMutationResult>;
  linkJob(link: ProjectJobLink): Promise<'linked' | 'not-found'>;
  linkOutput(link: ProjectOutputLink): Promise<'linked' | 'not-found'>;
}
