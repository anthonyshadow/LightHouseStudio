import {
  campaignStatusSchema,
  projectAssetRoleSchema,
  projectRevisionSourceSchema,
  projectSnapshotSchema,
  projectSourceKindSchema,
  projectStatusSchema,
  videoInputMimeTypeSchema,
} from '@studio/contracts';
import { z } from 'zod';
import { persistedTimestampSchema } from '../../application/timestamps.js';

export const ownerIdSchema = z.uuid();
const projectIdSchema = z.uuid();
const opaqueIdSchema = z.string().trim().min(1).max(200);

const storedProjectSchema = z
  .object({
    id: projectIdSchema,
    ownerUserId: ownerIdSchema,
    campaignId: z.uuid().nullable(),
    title: z.string().trim().min(1).max(120),
    status: projectStatusSchema,
    version: z.number().int().positive(),
    currentRevisionId: z.uuid(),
    currentRevisionNumber: z.number().int().positive(),
    archivedAt: persistedTimestampSchema.nullable(),
    deletedAt: persistedTimestampSchema.nullable(),
    createdAt: persistedTimestampSchema,
    updatedAt: persistedTimestampSchema,
  })
  .strict();

const storedRevisionSchema = z
  .object({
    id: z.uuid(),
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    revisionNumber: z.number().int().positive(),
    parentRevisionId: z.uuid().nullable(),
    parentRevisionNumber: z.number().int().positive().nullable(),
    snapshot: projectSnapshotSchema,
    author: z
      .object({ kind: z.enum(['user', 'system', 'migration']), authorId: opaqueIdSchema })
      .strict(),
    source: projectRevisionSourceSchema,
    createdAt: persistedTimestampSchema,
  })
  .strict();

const storedAssetLinkSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    assetId: z.uuid(),
    role: projectAssetRoleSchema,
    revisionId: z.uuid(),
    revisionNumber: z.number().int().positive(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

const storedVersionReferenceLinkSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    savedVideoId: z.uuid(),
    videoVersionId: z.uuid(),
    role: z.enum(['working', 'presented']),
    revisionId: z.uuid(),
    revisionNumber: z.number().int().positive(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

export const storedJobLinkSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    jobId: z.uuid(),
    initiatingRevisionId: z.uuid(),
    initiatingRevisionNumber: z.number().int().positive(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

export const storedOutputLinkSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    savedVideoId: z.uuid(),
    videoVersionId: z.uuid(),
    producingRevisionId: z.uuid(),
    producingRevisionNumber: z.number().int().positive(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

export const storedProjectSourceSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    assetId: z.uuid(),
    kind: projectSourceKindSchema,
    savedVideoId: z.uuid().nullable(),
    videoVersionId: z.uuid().nullable(),
    acceptedRevisionId: z.uuid(),
    acceptedRevisionNumber: z.number().int().positive(),
    operationKey: z.uuid(),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    mimeType: videoInputMimeTypeSchema,
    filename: z.string().trim().min(1).max(180),
    sizeBytes: z.number().int().positive().max(300_000_000),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    container: z.enum(['mp4', 'quicktime', 'webm']),
    videoCodec: z.enum(['avc', 'vp8']),
    audioCodec: z.string().trim().min(1).max(32).nullable(),
    durationMs: z.number().int().positive().max(300_000),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    hasAudio: z.boolean(),
    acceptedAt: persistedTimestampSchema,
  })
  .strict()
  .superRefine((source, context) => {
    const reused = source.kind === 'saved-video-version';
    if (reused !== (source.savedVideoId !== null && source.videoVersionId !== null)) {
      context.addIssue({ code: 'custom', message: 'Stored Project source lineage is invalid.' });
    }
  });

export const storedAggregateSchema = z
  .object({
    project: storedProjectSchema,
    revisions: z.array(storedRevisionSchema).min(1),
    assetLinks: z.array(storedAssetLinkSchema),
    versionReferenceLinks: z.array(storedVersionReferenceLinkSchema),
    jobLinks: z.array(storedJobLinkSchema),
    outputLinks: z.array(storedOutputLinkSchema),
    source: storedProjectSourceSchema.nullable().default(null),
  })
  .strict()
  .superRefine((aggregate, context) => {
    const { project } = aggregate;
    const owned = (value: { projectId: string; ownerUserId: string }) =>
      value.projectId === project.id && value.ownerUserId === project.ownerUserId;
    if (
      !aggregate.revisions.some(
        (revision) =>
          revision.id === project.currentRevisionId &&
          revision.revisionNumber === project.currentRevisionNumber,
      ) ||
      !aggregate.revisions.every(owned) ||
      !aggregate.assetLinks.every(owned) ||
      !aggregate.versionReferenceLinks.every(owned) ||
      !aggregate.jobLinks.every(owned) ||
      !aggregate.outputLinks.every(owned)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Stored Project ownership or revision is invalid.',
      });
    }
    if (
      aggregate.source !== null &&
      (!owned(aggregate.source) ||
        aggregate.source.assetId !==
          aggregate.revisions.find(({ id }) => id === aggregate.source?.acceptedRevisionId)
            ?.snapshot.sourceAssetId)
    ) {
      context.addIssue({ code: 'custom', message: 'Stored Project source is inconsistent.' });
    }
  });

export const storedCampaignSchema = z
  .object({
    id: z.uuid(),
    ownerUserId: ownerIdSchema,
    name: z.string().trim().min(1).max(120),
    brief: z.string().max(1_000).nullable(),
    status: campaignStatusSchema,
    version: z.number().int().positive(),
    archivedAt: persistedTimestampSchema.nullable(),
    deletedAt: persistedTimestampSchema.nullable(),
    createdAt: persistedTimestampSchema,
    updatedAt: persistedTimestampSchema,
  })
  .strict();

export const campaignCreateReceiptSchema = z
  .object({
    operationKey: z.uuid(),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    campaignId: z.uuid(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

export const createReceiptSchema = z
  .object({
    operationKey: z.uuid(),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    projectId: projectIdSchema,
    createdAt: persistedTimestampSchema,
  })
  .strict();

export const librarySchema = z
  .object({
    schemaVersion: z.literal(3),
    ownerUserId: ownerIdSchema,
    revision: z.number().int().nonnegative(),
    campaigns: z.array(storedCampaignSchema),
    projects: z.array(storedAggregateSchema),
    createReceipts: z.array(createReceiptSchema),
    campaignCreateReceipts: z.array(campaignCreateReceiptSchema),
  })
  .strict()
  .superRefine((library, context) => {
    const projectIds = library.projects.map(({ project }) => project.id);
    const campaignIds = library.campaigns.map(({ id }) => id);
    const operationKeys = library.createReceipts.map(({ operationKey }) => operationKey);
    const campaignOperationKeys = library.campaignCreateReceipts.map(
      ({ operationKey }) => operationKey,
    );
    const projectIdSet = new Set(projectIds);
    const campaignIdSet = new Set(campaignIds);
    if (
      projectIdSet.size !== projectIds.length ||
      campaignIdSet.size !== campaignIds.length ||
      new Set(operationKeys).size !== operationKeys.length ||
      new Set(campaignOperationKeys).size !== campaignOperationKeys.length ||
      library.campaigns.some(({ ownerUserId }) => ownerUserId !== library.ownerUserId) ||
      library.projects.some(({ project }) => project.ownerUserId !== library.ownerUserId) ||
      library.projects.some(
        ({ project }) => project.campaignId !== null && !campaignIdSet.has(project.campaignId),
      ) ||
      library.createReceipts.some(({ projectId }) => !projectIdSet.has(projectId)) ||
      library.campaignCreateReceipts.some(({ campaignId }) => !campaignIdSet.has(campaignId))
    ) {
      context.addIssue({ code: 'custom', message: 'Stored Project library identity is invalid.' });
    }
  });

export type ProjectLibrary = z.infer<typeof librarySchema>;

const previousLibraryEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(2),
    ownerUserId: ownerIdSchema,
    revision: z.number().int().nonnegative(),
    campaigns: z.array(storedCampaignSchema),
    projects: z.array(z.unknown()),
    createReceipts: z.array(createReceiptSchema),
    campaignCreateReceipts: z.array(campaignCreateReceiptSchema),
  })
  .strict();

const legacyLibraryEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerUserId: ownerIdSchema,
    revision: z.number().int().nonnegative(),
    projects: z.array(z.unknown()),
    createReceipts: z.array(createReceiptSchema),
  })
  .strict();

export const parseLibrary = (
  value: unknown,
): { readonly library: ProjectLibrary; readonly migrated: boolean } => {
  const current = librarySchema.safeParse(value);
  if (current.success) return { library: current.data, migrated: false };
  const previous = previousLibraryEnvelopeSchema.safeParse(value);
  if (previous.success) {
    return {
      migrated: true,
      library: librarySchema.parse({
        ...previous.data,
        schemaVersion: 3,
        projects: previous.data.projects.map((aggregate) => storedAggregateSchema.parse(aggregate)),
      }),
    };
  }
  const legacy = legacyLibraryEnvelopeSchema.parse(value);
  const projects = legacy.projects.map((aggregateValue) => {
    const aggregate = z
      .object({ project: z.record(z.string(), z.unknown()) })
      .passthrough()
      .parse(aggregateValue);
    return storedAggregateSchema.parse({
      ...(aggregateValue as object),
      project: { ...aggregate.project, campaignId: null },
    });
  });
  return {
    migrated: true,
    library: librarySchema.parse({
      schemaVersion: 3,
      ownerUserId: legacy.ownerUserId,
      revision: legacy.revision,
      campaigns: [],
      projects,
      createReceipts: legacy.createReceipts,
      campaignCreateReceipts: [],
    }),
  };
};

export const journalSchema = z
  .object({
    schemaVersion: z.literal(3),
    ownerUserId: ownerIdSchema,
    transactionId: z.uuid(),
    state: z.literal('prepared'),
    operation: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('project-create'),
          operationKey: z.uuid(),
          requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
          projectId: projectIdSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal('project-source-accept'),
          operationKey: z.uuid(),
          requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
          projectId: projectIdSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal('campaign-create'),
          operationKey: z.uuid(),
          requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
          campaignId: z.uuid(),
        })
        .strict(),
    ]),
    preparedAt: persistedTimestampSchema,
    writes: z.object({ metadata: librarySchema }).strict(),
  })
  .strict()
  .superRefine((journal, context) => {
    const metadata = journal.writes.metadata;
    const operation = journal.operation;
    const consistent =
      operation.kind === 'project-create'
        ? metadata.createReceipts.some(
            (receipt) =>
              receipt.operationKey === operation.operationKey &&
              receipt.projectId === operation.projectId &&
              receipt.requestFingerprint === operation.requestFingerprint,
          )
        : operation.kind === 'campaign-create'
          ? metadata.campaignCreateReceipts.some(
              (receipt) =>
                receipt.operationKey === operation.operationKey &&
                receipt.campaignId === operation.campaignId &&
                receipt.requestFingerprint === operation.requestFingerprint,
            )
          : metadata.projects.some(
              ({ source }) =>
                source?.projectId === operation.projectId &&
                source.operationKey === operation.operationKey &&
                source.requestFingerprint === operation.requestFingerprint,
            );
    if (metadata.ownerUserId !== journal.ownerUserId || !consistent) {
      context.addIssue({ code: 'custom', message: 'Prepared Project journal is inconsistent.' });
    }
  });

const previousJournalSchema = z
  .object({
    schemaVersion: z.literal(2),
    ownerUserId: ownerIdSchema,
    transactionId: z.uuid(),
    state: z.literal('prepared'),
    operation: journalSchema.shape.operation,
    preparedAt: persistedTimestampSchema,
    writes: z.object({ metadata: z.unknown() }).strict(),
  })
  .strict();

const legacyJournalSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerUserId: ownerIdSchema,
    transactionId: z.uuid(),
    state: z.literal('prepared'),
    operation: z
      .object({
        kind: z.literal('project-create'),
        operationKey: z.uuid(),
        requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
        projectId: projectIdSchema,
      })
      .strict(),
    preparedAt: persistedTimestampSchema,
    writes: z.object({ projectMetadata: z.unknown() }).strict(),
  })
  .strict();

export const parseJournal = (value: unknown): z.infer<typeof journalSchema> => {
  const current = journalSchema.safeParse(value);
  if (current.success) return current.data;
  const previous = previousJournalSchema.safeParse(value);
  if (previous.success) {
    return journalSchema.parse({
      ...previous.data,
      schemaVersion: 3,
      writes: { metadata: parseLibrary(previous.data.writes.metadata).library },
    });
  }
  const legacy = legacyJournalSchema.parse(value);
  const metadata = parseLibrary(legacy.writes.projectMetadata).library;
  return journalSchema.parse({
    schemaVersion: 3,
    ownerUserId: legacy.ownerUserId,
    transactionId: legacy.transactionId,
    state: legacy.state,
    operation: legacy.operation,
    preparedAt: legacy.preparedAt,
    writes: { metadata },
  });
};

export const emptyLibrary = (ownerUserId: string): ProjectLibrary => ({
  schemaVersion: 3,
  ownerUserId: ownerIdSchema.parse(ownerUserId),
  revision: 0,
  campaigns: [],
  projects: [],
  createReceipts: [],
  campaignCreateReceipts: [],
});

export type StoredProjectAggregate = z.infer<typeof storedAggregateSchema>;
export type ProjectJournal = z.infer<typeof journalSchema>;
