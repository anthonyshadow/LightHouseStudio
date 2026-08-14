import {
  campaignStatusSchema,
  inspectedVideoSchema,
  projectProcessingCapabilitySchema,
  projectAssetRoleSchema,
  projectRevisionSourceSchema,
  projectOutputSaveResultSchema,
  projectSnapshotSchema,
  projectSourceKindSchema,
  projectStatusSchema,
  videoInputMimeTypeSchema,
  videoJobErrorCodeSchema,
  videoOutputResolutionSchema,
} from '@studio/contracts';
import { z } from 'zod';
import { persistedTimestampSchema } from '../../application/timestamps.js';
import { savedVideoLibrarySchema } from '../saved-videos/saved-video-repository.js';
import { projectMediaReferencesEqual } from './project-snapshot-relations.js';

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

export const storedProjectProcessingAttemptSchema = z
  .object({
    operationId: z.uuid(),
    ownerUserId: ownerIdSchema,
    projectId: projectIdSchema,
    capability: projectProcessingCapabilitySchema,
    provider: z.string().trim().min(1).max(80),
    providerJobId: z.string().trim().min(1).max(500).nullable(),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    inputAssetId: z.uuid(),
    resultAssetId: z.uuid(),
    outputAssetId: z.uuid().nullable(),
    result: inspectedVideoSchema.nullable(),
    retryOfOperationId: z.uuid().nullable(),
    attemptNumber: z.number().int().positive(),
    initiatingRevisionId: z.uuid(),
    initiatingRevisionNumber: z.number().int().positive(),
    resultRevisionId: z.uuid().nullable(),
    resultRevisionNumber: z.number().int().positive().nullable(),
    status: z.enum([
      'pending',
      'validating',
      'submitting',
      'accepted',
      'ambiguous',
      'queued',
      'processing',
      'retrieving',
      'ready',
      'failed',
      'expired',
      'cancelled',
    ]),
    safeErrorCode: z.union([videoJobErrorCodeSchema, z.literal('processing_failed')]).nullable(),
    outputResolution: videoOutputResolutionSchema,
    providerOutputLocation: z.string().trim().min(1).max(2_000).nullable(),
    sourceDurationMs: z.number().int().positive().max(300_000),
    sourceOrientation: z.enum(['landscape', 'portrait']),
    createdAt: persistedTimestampSchema,
    updatedAt: persistedTimestampSchema,
    acceptedAt: persistedTimestampSchema.nullable(),
    completedAt: persistedTimestampSchema.nullable(),
    expiresAt: persistedTimestampSchema,
  })
  .strict()
  .superRefine((attempt, context) => {
    if (
      (attempt.resultRevisionId === null) !== (attempt.resultRevisionNumber === null) ||
      (attempt.outputAssetId === null) !== (attempt.result === null) ||
      (attempt.outputAssetId !== null && attempt.outputAssetId !== attempt.resultAssetId) ||
      (attempt.status === 'ambiguous') !== (attempt.safeErrorCode === 'submission_ambiguous')
    ) {
      context.addIssue({ code: 'custom', message: 'Stored Project processing state is invalid.' });
    }
  });

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

export const storedProjectWorkingMediaSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    kind: z.enum(['local-render', 'media-asset', 'saved-video-version']),
    mediaReference: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('asset'), assetId: z.uuid() }).strict(),
      z
        .object({
          kind: z.literal('saved-video-version'),
          savedVideoId: z.uuid(),
          videoVersionId: z.uuid(),
        })
        .strict(),
    ]),
    assetId: z.uuid(),
    savedVideoId: z.uuid().nullable(),
    videoVersionId: z.uuid().nullable(),
    adoptedRevisionId: z.uuid(),
    adoptedRevisionNumber: z.number().int().positive(),
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
    adoptedAt: persistedTimestampSchema,
  })
  .strict()
  .superRefine((media, context) => {
    const saved = media.kind === 'saved-video-version';
    if (
      saved !== (media.savedVideoId !== null && media.videoVersionId !== null) ||
      saved !== (media.mediaReference.kind === 'saved-video-version') ||
      (!saved &&
        (media.mediaReference.kind !== 'asset' || media.mediaReference.assetId !== media.assetId))
    ) {
      context.addIssue({ code: 'custom', message: 'Stored Project working media is invalid.' });
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
    workingMediaAdoptions: z.array(storedProjectWorkingMediaSchema).default([]),
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
      !aggregate.outputLinks.every(owned) ||
      !aggregate.workingMediaAdoptions.every(owned)
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
    if (
      aggregate.workingMediaAdoptions.some((media) => {
        const revision = aggregate.revisions.find(
          ({ id, revisionNumber }) =>
            id === media.adoptedRevisionId && revisionNumber === media.adoptedRevisionNumber,
        );
        return (
          revision === undefined ||
          !projectMediaReferencesEqual(revision.snapshot.workingMedia, media.mediaReference) ||
          !projectMediaReferencesEqual(revision.snapshot.presentedMedia, media.mediaReference)
        );
      })
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Stored working-media revision is inconsistent.',
      });
    }
    const outputRelationKeys = new Set(
      aggregate.outputLinks.map(
        ({ savedVideoId, videoVersionId }) => `${savedVideoId}:${videoVersionId}`,
      ),
    );
    if (
      aggregate.revisions.some(({ snapshot }) => {
        const output = snapshot.lastSuccessfulOutput;
        return (
          output !== null &&
          !outputRelationKeys.has(`${output.savedVideoId}:${output.videoVersionId}`)
        );
      })
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Stored Project output pointers require exact retained producer relations.',
      });
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

export const projectOutputReceiptSchema = z
  .object({
    operationId: z.uuid(),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    projectId: projectIdSchema,
    savedVideoId: z.uuid(),
    videoVersionId: z.uuid(),
    resultRevisionId: z.uuid(),
    resultRevisionNumber: z.number().int().positive(),
    result: projectOutputSaveResultSchema,
    createdAt: persistedTimestampSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    if (
      receipt.result.operationId !== receipt.operationId ||
      receipt.result.project.id !== receipt.projectId ||
      receipt.result.savedVideo.id !== receipt.savedVideoId ||
      receipt.result.output.videoVersionId !== receipt.videoVersionId ||
      receipt.result.revision.id !== receipt.resultRevisionId ||
      receipt.result.revision.revisionNumber !== receipt.resultRevisionNumber
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Stored Project output receipt is inconsistent.',
      });
    }
  });

export const librarySchema = z
  .object({
    schemaVersion: z.literal(6),
    ownerUserId: ownerIdSchema,
    revision: z.number().int().nonnegative(),
    campaigns: z.array(storedCampaignSchema),
    projects: z.array(storedAggregateSchema),
    processingJobs: z.array(storedProjectProcessingAttemptSchema),
    createReceipts: z.array(createReceiptSchema),
    campaignCreateReceipts: z.array(campaignCreateReceiptSchema),
    outputReceipts: z.array(projectOutputReceiptSchema),
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
    const processingOperationIds = library.processingJobs.map(({ operationId }) => operationId);
    const outputOperationIds = library.outputReceipts.map(({ operationId }) => operationId);
    if (
      projectIdSet.size !== projectIds.length ||
      campaignIdSet.size !== campaignIds.length ||
      new Set(operationKeys).size !== operationKeys.length ||
      new Set(campaignOperationKeys).size !== campaignOperationKeys.length ||
      new Set(processingOperationIds).size !== processingOperationIds.length ||
      new Set(outputOperationIds).size !== outputOperationIds.length ||
      library.campaigns.some(({ ownerUserId }) => ownerUserId !== library.ownerUserId) ||
      library.projects.some(({ project }) => project.ownerUserId !== library.ownerUserId) ||
      library.processingJobs.some(({ ownerUserId }) => ownerUserId !== library.ownerUserId) ||
      library.outputReceipts.some(
        (receipt) =>
          !projectIdSet.has(receipt.projectId) ||
          !library.projects.some(
            ({ revisions, outputLinks }) =>
              revisions.some(
                ({ id, revisionNumber }) =>
                  id === receipt.resultRevisionId &&
                  revisionNumber === receipt.resultRevisionNumber,
              ) &&
              outputLinks.some(
                ({ projectId, savedVideoId, videoVersionId }) =>
                  projectId === receipt.projectId &&
                  savedVideoId === receipt.savedVideoId &&
                  videoVersionId === receipt.videoVersionId,
              ),
          ),
      ) ||
      library.projects.some(
        ({ project }) => project.campaignId !== null && !campaignIdSet.has(project.campaignId),
      ) ||
      library.createReceipts.some(({ projectId }) => !projectIdSet.has(projectId)) ||
      library.processingJobs.some(
        ({
          projectId,
          operationId,
          initiatingRevisionId,
          initiatingRevisionNumber,
          retryOfOperationId,
        }) => {
          const project = library.projects.find(({ project }) => project.id === projectId);
          const linked = project?.jobLinks.some(
            (link) =>
              link.jobId === operationId &&
              link.initiatingRevisionId === initiatingRevisionId &&
              link.initiatingRevisionNumber === initiatingRevisionNumber,
          );
          return (
            !linked ||
            (retryOfOperationId !== null &&
              !library.processingJobs.some(
                (candidate) =>
                  candidate.operationId === retryOfOperationId && candidate.projectId === projectId,
              ))
          );
        },
      ) ||
      library.campaignCreateReceipts.some(({ campaignId }) => !campaignIdSet.has(campaignId))
    ) {
      context.addIssue({ code: 'custom', message: 'Stored Project library identity is invalid.' });
    }
  });

export type ProjectLibrary = z.infer<typeof librarySchema>;

const previousLibraryEnvelopeSchema = z
  .object({
    schemaVersion: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    ownerUserId: ownerIdSchema,
    revision: z.number().int().nonnegative(),
    campaigns: z.array(storedCampaignSchema),
    projects: z.array(z.unknown()),
    createReceipts: z.array(createReceiptSchema),
    campaignCreateReceipts: z.array(campaignCreateReceiptSchema),
    processingJobs: z.array(storedProjectProcessingAttemptSchema).optional(),
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
        schemaVersion: 6,
        projects: previous.data.projects.map((aggregate) => storedAggregateSchema.parse(aggregate)),
        processingJobs: previous.data.processingJobs ?? [],
        outputReceipts: [],
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
      schemaVersion: 6,
      ownerUserId: legacy.ownerUserId,
      revision: legacy.revision,
      campaigns: [],
      projects,
      processingJobs: [],
      createReceipts: legacy.createReceipts,
      campaignCreateReceipts: [],
      outputReceipts: [],
    }),
  };
};

export const journalSchema = z
  .object({
    schemaVersion: z.literal(6),
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
          kind: z.literal('project-processing-admit'),
          operationId: z.uuid(),
          requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
          projectId: projectIdSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal('project-processing-result'),
          operationId: z.uuid(),
          projectId: projectIdSchema,
          assetId: z.uuid(),
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
          kind: z.literal('project-working-media-adopt'),
          operationKey: z.uuid(),
          requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
          projectId: projectIdSchema,
          revisionId: z.uuid(),
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
      z
        .object({
          kind: z.literal('project-output-save'),
          operationId: z.uuid(),
          requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
          projectId: projectIdSchema,
          savedVideoId: z.uuid(),
          videoVersionId: z.uuid(),
          resultRevisionId: z.uuid(),
        })
        .strict(),
    ]),
    preparedAt: persistedTimestampSchema,
    writes: z
      .object({ metadata: librarySchema, savedVideos: savedVideoLibrarySchema.optional() })
      .strict(),
  })
  .strict()
  .superRefine((journal, context) => {
    const metadata = journal.writes.metadata;
    const operation = journal.operation;
    let consistent: boolean;
    switch (operation.kind) {
      case 'project-create':
        consistent = metadata.createReceipts.some(
          (receipt) =>
            receipt.operationKey === operation.operationKey &&
            receipt.projectId === operation.projectId &&
            receipt.requestFingerprint === operation.requestFingerprint,
        );
        break;
      case 'campaign-create':
        consistent = metadata.campaignCreateReceipts.some(
          (receipt) =>
            receipt.operationKey === operation.operationKey &&
            receipt.campaignId === operation.campaignId &&
            receipt.requestFingerprint === operation.requestFingerprint,
        );
        break;
      case 'project-source-accept':
        consistent = metadata.projects.some(
          ({ source }) =>
            source?.projectId === operation.projectId &&
            source.operationKey === operation.operationKey &&
            source.requestFingerprint === operation.requestFingerprint,
        );
        break;
      case 'project-working-media-adopt':
        consistent = metadata.projects.some(({ workingMediaAdoptions }) =>
          workingMediaAdoptions.some(
            (media) =>
              media.projectId === operation.projectId &&
              media.adoptedRevisionId === operation.revisionId &&
              media.operationKey === operation.operationKey &&
              media.requestFingerprint === operation.requestFingerprint,
          ),
        );
        break;
      case 'project-processing-admit':
        consistent = metadata.processingJobs.some(
          (attempt) =>
            attempt.operationId === operation.operationId &&
            attempt.projectId === operation.projectId &&
            attempt.requestFingerprint === operation.requestFingerprint,
        );
        break;
      case 'project-processing-result':
        consistent = metadata.processingJobs.some(
          (attempt) =>
            attempt.operationId === operation.operationId &&
            attempt.projectId === operation.projectId &&
            attempt.outputAssetId === operation.assetId,
        );
        break;
      case 'project-output-save':
        consistent =
          metadata.outputReceipts.some(
            (receipt) =>
              receipt.operationId === operation.operationId &&
              receipt.requestFingerprint === operation.requestFingerprint &&
              receipt.projectId === operation.projectId &&
              receipt.savedVideoId === operation.savedVideoId &&
              receipt.videoVersionId === operation.videoVersionId &&
              receipt.resultRevisionId === operation.resultRevisionId,
          ) &&
          journal.writes.savedVideos?.ownerUserId === journal.ownerUserId &&
          journal.writes.savedVideos.videos.some(
            ({ video, versions }) =>
              video.id === operation.savedVideoId &&
              versions.some(({ id }) => id === operation.videoVersionId),
          );
        break;
    }
    if (
      metadata.ownerUserId !== journal.ownerUserId ||
      !consistent ||
      (operation.kind === 'project-output-save') !== (journal.writes.savedVideos !== undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'Prepared Project journal is inconsistent.' });
    }
  });

const previousJournalSchema = z
  .object({
    schemaVersion: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
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
      schemaVersion: 6,
      writes: { metadata: parseLibrary(previous.data.writes.metadata).library },
    });
  }
  const legacy = legacyJournalSchema.parse(value);
  const metadata = parseLibrary(legacy.writes.projectMetadata).library;
  return journalSchema.parse({
    schemaVersion: 6,
    ownerUserId: legacy.ownerUserId,
    transactionId: legacy.transactionId,
    state: legacy.state,
    operation: legacy.operation,
    preparedAt: legacy.preparedAt,
    writes: { metadata },
  });
};

export const emptyLibrary = (ownerUserId: string): ProjectLibrary => ({
  schemaVersion: 6,
  ownerUserId: ownerIdSchema.parse(ownerUserId),
  revision: 0,
  campaigns: [],
  projects: [],
  processingJobs: [],
  createReceipts: [],
  campaignCreateReceipts: [],
  outputReceipts: [],
});

export type StoredProjectAggregate = z.infer<typeof storedAggregateSchema>;
export type ProjectJournal = z.infer<typeof journalSchema>;
