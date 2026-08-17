import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import {
  VIDEO_JOB_TTL_MS,
  projectProcessingAttemptSchema,
  projectProcessingCurrentResponseSchema,
  projectProcessingHistoryResponseSchema,
  projectProcessingMutationResponseSchema,
  videoTransformRecipeSchema,
  type InspectedVideo,
  type ProjectProcessingAttempt,
  type ProjectProcessingCapability,
  type ProjectProcessingCurrentResponse,
  type ProjectProcessingHistoryQuery,
  type ProjectProcessingHistoryResponse,
  type ProjectProcessingMutationResponse,
  type VideoTransformRecipe,
} from '@studio/contracts';
import {
  projectProcessingBlocksArchive,
  projectProcessingPhase,
  projectProcessingRetryPolicy,
  promoteProjectJobResult,
  type ProjectAssetLink,
  type ProjectJobLink,
  type ProjectMediaReference,
} from '@studio/domain';
import { KeyedLock } from '../../application/keyed-lock.js';
import { AppError } from '../../http/app-error.js';
import type { AssetByteStore, AssetReadHandle } from '../../storage/asset-byte-store.js';
import type { ReferenceImageAssetStore } from '../reference-images/asset-store.js';
import { inspectStoredProjectMedia } from './project-media-inspection.js';
import {
  projectAggregateForCurrent,
  type ProjectCurrentRead,
  type ProjectRepository,
  type ProjectSourceRecord,
  type ProjectWorkingMediaRecord,
} from './project-repository.js';
import { projectRequestFingerprint } from './project-request-fingerprint.js';
import type {
  ProjectProcessingAttemptRecord,
  ProjectProcessingRepository,
} from './project-processing-repository.js';
import {
  projectAssetLinksForRevision,
  projectMediaReferencesEqual,
} from './project-snapshot-relations.js';
import { inspectVideoFile } from '../video-jobs/media-inspection.js';
import type { VideoJobService } from '../video-jobs/video-job-service.js';

const PROCESSING_SYSTEM_AUTHOR = 'project-processing';
const PROCESSING_POLL_AFTER_MS = 2_000;
const LOCALLY_STOPPABLE_PROCESSING_STATUSES = new Set([
  'pending',
  'validating',
  'submitting',
  'accepted',
  'queued',
  'processing',
  'retrieving',
]);

const sourceMediaReference = (source: ProjectSourceRecord): ProjectMediaReference =>
  source.kind === 'saved-video-version'
    ? {
        kind: 'saved-video-version',
        savedVideoId: source.savedVideoId!,
        videoVersionId: source.videoVersionId!,
      }
    : { kind: 'asset', assetId: source.assetId };

type ProcessingInputRecord = Pick<
  ProjectSourceRecord | ProjectWorkingMediaRecord,
  | 'assetId'
  | 'mimeType'
  | 'sizeBytes'
  | 'checksumSha256'
  | 'container'
  | 'videoCodec'
  | 'audioCodec'
  | 'durationMs'
  | 'width'
  | 'height'
  | 'hasAudio'
>;

const safeErrorMessage = (
  code: ProjectProcessingAttemptRecord['safeErrorCode'],
  provider: ProjectProcessingAttemptRecord['provider'],
): {
  readonly code: NonNullable<ProjectProcessingAttempt['error']>['code'];
  readonly message: string;
} => {
  switch (code) {
    case 'submission_ambiguous':
      return {
        code,
        message:
          'Submission may have been accepted, but no recoverable provider identity was retained. Review possible cost before another attempt.',
      };
    case 'provider_unavailable':
      return {
        code,
        message: 'Processing is unavailable until server configuration is corrected.',
      };
    case 'provider_timeout':
      return { code, message: 'Processing did not respond within the bounded deadline.' };
    case 'provider_billing': {
      const providerLabel =
        provider === 'decart' ? 'Decart' : provider === 'pruna' ? 'Pruna' : 'The provider';
      return {
        code,
        message: `${providerLabel} rejected this attempt because the configured account needs billing or credits. Resolve the provider account before retrying.`,
      };
    }
    case 'result_invalid':
      return { code, message: 'The returned video did not pass the app-owned media checks.' };
    case 'result_too_large':
      return { code, message: 'The returned video exceeded the app-owned size limit.' };
    case 'job_expired':
      return { code, message: 'This attempt expired. Start a new attempt explicitly.' };
    case 'processing_failed':
      return { code, message: 'Processing could not complete this attempt.' };
    case 'invalid_video':
    case 'unsupported_container':
    case 'unsupported_codec':
    case 'unsupported_aspect_ratio':
    case 'duration_exceeded':
    case 'payload_too_large':
      return {
        code: 'provider_rejected',
        message:
          'The saved video or setup did not pass processing validation. Review it before starting another provider attempt.',
      };
    case 'provider_rejected':
      return {
        code,
        message:
          'The provider rejected the submitted media or replacement instructions. Review the saved setup before retrying.',
      };
    case null:
      return { code: 'processing_failed', message: 'Processing needs attention.' };
  }
};

const historyCursor = (value: {
  readonly createdAt: string;
  readonly operationId: string;
}): string => Buffer.from(JSON.stringify({ version: 1, ...value }), 'utf8').toString('base64url');

const parseHistoryCursor = (
  value: string | undefined,
): { readonly createdAt: string; readonly operationId: string } | undefined => {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      parsed.version === 1 &&
      typeof parsed.createdAt === 'string' &&
      Number.isFinite(Date.parse(parsed.createdAt)) &&
      typeof parsed.operationId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        parsed.operationId,
      )
    ) {
      return {
        createdAt: new Date(parsed.createdAt).toISOString(),
        operationId: parsed.operationId,
      };
    }
  } catch {
    // Opaque cursors fail through one finite public validation error.
  }
  throw new AppError(400, 'validation_error', 'Use a valid processing-history cursor.');
};

export class ProjectProcessingService {
  readonly #lock = new KeyedLock();

  constructor(
    private readonly projects: ProjectRepository,
    private readonly processing: ProjectProcessingRepository,
    private readonly videoJobs: VideoJobService,
    private readonly bytes: AssetByteStore,
    private readonly references: ReferenceImageAssetStore,
    private readonly options: {
      readonly now?: () => Date;
      readonly createId?: () => string;
      readonly inspectInput?: (
        path: string,
        capability: 'character-swap' | 'virtual-try-on',
      ) => Promise<InspectedVideo>;
    } = {},
  ) {}

  get #now(): () => Date {
    return this.options.now ?? (() => new Date());
  }

  get #createId(): () => string {
    return this.options.createId ?? randomUUID;
  }

  async #requireCurrent(ownerUserId: string, projectId: string): Promise<ProjectCurrentRead> {
    const current = await this.projects.getCurrent(ownerUserId, projectId);
    if (current === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    return current;
  }

  async #processingInput(
    ownerUserId: string,
    projectId: string,
    current: ProjectCurrentRead,
  ): Promise<{ readonly record: ProcessingInputRecord; readonly asset: AssetReadHandle }> {
    const reference = current.revision.snapshot.workingMedia;
    if (current.revision.snapshot.sourceAssetId === null || reference === null) {
      throw new AppError(409, 'conflict', 'Adopt a durable Project source before processing.');
    }
    const working = await this.projects.getWorkingMedia(ownerUserId, projectId);
    let record: ProcessingInputRecord | null = null;
    if (
      working !== null &&
      projectMediaReferencesEqual(working.media.mediaReference, reference) &&
      projectMediaReferencesEqual(current.revision.snapshot.presentedMedia, reference)
    ) {
      record = working.media;
    } else {
      const source = await this.projects.getSource(ownerUserId, projectId);
      if (source !== null && projectMediaReferencesEqual(sourceMediaReference(source), reference)) {
        record = source;
      }
    }
    if (record === null) {
      throw new AppError(409, 'conflict', 'The exact current Project input is unavailable.');
    }
    const asset = await this.bytes.open(ownerUserId, record.assetId);
    if (
      asset === null ||
      asset.manifest.checksumSha256 !== record.checksumSha256 ||
      asset.manifest.sizeBytes !== record.sizeBytes ||
      asset.manifest.mimeType !== record.mimeType
    ) {
      throw new AppError(409, 'asset_missing', 'The exact current Project input is unavailable.');
    }
    return { record, asset };
  }

  #recipe(
    current: ProjectCurrentRead,
    capability: Exclude<ProjectProcessingCapability, 'voice'>,
  ): { readonly recipe: VideoTransformRecipe; readonly referenceAssetId: string | null } {
    const snapshot = current.revision.snapshot;
    if (snapshot.visualTreatment.kind !== capability) {
      throw new AppError(
        409,
        'conflict',
        'Checkpoint matching visual intent before starting Project processing.',
      );
    }
    const referenceAssetId =
      snapshot.creativeIntent.referenceAssetId ??
      (capability === 'character-swap'
        ? snapshot.selectedCharacter?.referenceAssetId
        : snapshot.selectedOutfit?.referenceAssetId) ??
      null;
    if (capability === 'character-swap') {
      return {
        referenceAssetId,
        recipe: videoTransformRecipeSchema.parse({
          operation: capability,
          ...(snapshot.visualTreatment.providerId === null
            ? {}
            : { provider: snapshot.visualTreatment.providerId }),
          inputKind: 'character',
          prompt: snapshot.creativeIntent.appliedPrompt ?? '',
          enhancePrompt: false,
          hasReferenceImage: referenceAssetId !== null,
          ...(snapshot.visualTreatment.outputResolution === null
            ? {}
            : { outputResolution: snapshot.visualTreatment.outputResolution }),
        }),
      };
    }
    const treatment = snapshot.visualTreatment;
    if (treatment.kind !== 'virtual-try-on') {
      throw new AppError(409, 'conflict', 'Checkpoint Virtual Try-On intent before processing.');
    }
    const inputKind = treatment.inputKind ?? snapshot.selectedOutfit?.inputKind ?? null;
    return {
      referenceAssetId,
      recipe: videoTransformRecipeSchema.parse({
        operation: capability,
        ...(inputKind === null ? {} : { inputKind }),
        prompt: snapshot.creativeIntent.appliedPrompt ?? '',
        enhancePrompt: treatment.enhancePrompt ?? false,
        hasReferenceImage: referenceAssetId !== null,
        ...(treatment.outputResolution === null
          ? {}
          : { outputResolution: treatment.outputResolution }),
      }),
    };
  }

  async submit(input: {
    readonly ownerUserId: string;
    readonly projectId: string;
    readonly operationId: string;
    readonly expectedVersion: number;
    readonly expectedRevisionNumber: number;
    readonly capability: ProjectProcessingCapability;
    readonly retryOfOperationId?: string;
    readonly acknowledgePossibleDuplicateCost?: boolean;
  }): Promise<ProjectProcessingMutationResponse> {
    return this.#lock.run(`${input.ownerUserId}:${input.operationId}`, async () => {
      const prior = await this.processing.getProjectAttempt(
        input.ownerUserId,
        input.projectId,
        input.operationId,
      );
      if (prior !== null) {
        if (
          prior.capability !== input.capability ||
          prior.initiatingRevisionNumber !== input.expectedRevisionNumber ||
          prior.retryOfOperationId !== (input.retryOfOperationId ?? null)
        ) {
          throw new AppError(
            409,
            'request_id_conflict',
            'That operation ID belongs to different Project processing settings.',
          );
        }
        return projectProcessingMutationResponseSchema.parse({
          replayed: true,
          attempt: await this.#publicAttempt(input.ownerUserId, input.projectId, prior),
        });
      }
      if (input.capability === 'voice') {
        throw new AppError(
          503,
          'feature_unavailable',
          'Provider-backed Voice remains gated because it has no durable reconnect identity.',
        );
      }
      const current = await this.#requireCurrent(input.ownerUserId, input.projectId);
      if (
        current.project.version !== input.expectedVersion ||
        current.revision.revisionNumber !== input.expectedRevisionNumber
      ) {
        throw new AppError(409, 'conflict', 'Refresh the Project before starting processing.');
      }
      const currentAttempt = await this.processing.getCurrentProjectAttempt(
        input.ownerUserId,
        input.projectId,
      );
      if (input.retryOfOperationId === undefined && currentAttempt !== null) {
        throw new AppError(
          409,
          'conflict',
          'Use the explicit retry command for the current processing attempt.',
        );
      }
      if (await this.videoJobs.reconcileActiveJob(input.ownerUserId)) {
        throw new AppError(
          409,
          'generation_in_progress',
          'Another video edit is still processing. Wait for it to finish, then start this Project edit again.',
        );
      }
      let previous: ProjectProcessingAttemptRecord | null = null;
      if (input.retryOfOperationId !== undefined) {
        previous = await this.processing.getProjectAttempt(
          input.ownerUserId,
          input.projectId,
          input.retryOfOperationId,
        );
        if (
          previous === null ||
          currentAttempt?.operationId !== previous.operationId ||
          previous.capability !== input.capability ||
          projectProcessingRetryPolicy(previous.status) === 'not-allowed'
        ) {
          throw new AppError(409, 'conflict', 'That processing attempt cannot be retried.');
        }
        if (previous.status === 'ambiguous' && input.acknowledgePossibleDuplicateCost !== true) {
          throw new AppError(
            409,
            'conflict',
            'Confirm the possible duplicate provider cost before retrying this ambiguous attempt.',
          );
        }
      }
      const { recipe, referenceAssetId } = this.#recipe(current, input.capability);
      const resolved = this.videoJobs.resolveSubmission(recipe);
      const processingInput = await this.#processingInput(
        input.ownerUserId,
        input.projectId,
        current,
      );
      const paths = await this.videoJobs.prepareJobDirectory(input.operationId);
      try {
        await pipeline(
          processingInput.asset.createReadStream(),
          createWriteStream(paths.inputPath, { flags: 'wx', mode: 0o600 }),
        );
        let referenceMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | null = null;
        if (referenceAssetId !== null) {
          const reference =
            (await this.references.getContentStream?.(input.ownerUserId, referenceAssetId)) ?? null;
          if (reference === null) {
            throw new AppError(404, 'not_found', 'The exact selected reference is unavailable.');
          }
          referenceMimeType = reference.metadata.mimeType;
          await pipeline(
            reference.createReadStream(),
            createWriteStream(paths.referencePath, { flags: 'wx', mode: 0o600 }),
          );
        }
        const inspected = await (this.options.inspectInput ?? inspectVideoFile)(
          paths.inputPath,
          input.capability,
        );
        if (
          inspected.mimeType !== processingInput.record.mimeType ||
          inspected.sizeBytes !== processingInput.record.sizeBytes ||
          Math.round(inspected.durationMs) !== processingInput.record.durationMs ||
          inspected.width !== processingInput.record.width ||
          inspected.height !== processingInput.record.height
        ) {
          throw new AppError(409, 'conflict', 'The durable Project input failed reinspection.');
        }
        if (resolved.inputPreparation === 'h264-mp4' && inspected.mimeType !== 'video/mp4') {
          throw new AppError(
            409,
            'unsupported_container',
            'Adopt a prepared H.264 MP4 before using this Project processing capability.',
          );
        }
        const createdAt = this.#now().toISOString();
        const requestFingerprint = projectRequestFingerprint({
          version: 1,
          projectId: input.projectId,
          initiatingRevisionId: current.revision.id,
          initiatingRevisionNumber: current.revision.revisionNumber,
          capability: input.capability,
          provider: resolved.providerId,
          inputAssetId: processingInput.record.assetId,
          inputChecksumSha256: processingInput.record.checksumSha256,
          referenceAssetId,
          recipe,
          retryOfOperationId: input.retryOfOperationId ?? null,
        });
        const attempt: ProjectProcessingAttemptRecord = {
          operationId: input.operationId,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          capability: input.capability,
          provider: resolved.providerId,
          providerJobId: null,
          requestFingerprint,
          inputAssetId: processingInput.record.assetId,
          resultAssetId: this.#createId(),
          outputAssetId: null,
          result: null,
          retryOfOperationId: input.retryOfOperationId ?? null,
          attemptNumber: (previous?.attemptNumber ?? 0) + 1,
          initiatingRevisionId: current.revision.id,
          initiatingRevisionNumber: current.revision.revisionNumber,
          resultRevisionId: null,
          resultRevisionNumber: null,
          status: 'submitting',
          safeErrorCode: null,
          outputResolution: resolved.outputResolution,
          providerOutputLocation: null,
          sourceDurationMs: Math.round(inspected.durationMs),
          sourceOrientation: inspected.width > inspected.height ? 'landscape' : 'portrait',
          createdAt,
          updatedAt: createdAt,
          acceptedAt: null,
          completedAt: null,
          expiresAt: new Date(Date.parse(createdAt) + VIDEO_JOB_TTL_MS).toISOString(),
        };
        const link: ProjectJobLink = {
          projectId: input.projectId,
          ownerUserId: input.ownerUserId,
          jobId: input.operationId,
          initiatingRevisionId: current.revision.id,
          initiatingRevisionNumber: current.revision.revisionNumber,
          createdAt,
        };
        const admission = await this.processing.admitProjectAttempt({
          attempt,
          link,
          expectedVersion: input.expectedVersion,
          expectedRevisionNumber: input.expectedRevisionNumber,
        });
        if (admission.kind === 'not-found') {
          throw new AppError(404, 'not_found', 'That Project is unavailable.');
        }
        if (admission.kind === 'conflict') {
          if (admission.conflict.kind === 'active-attempt') {
            throw new AppError(
              409,
              'generation_in_progress',
              'Another video edit is still processing. Wait for it to finish, then start this Project edit again.',
            );
          }
          throw new AppError(409, 'conflict', 'Project processing admission conflicted.');
        }
        if (admission.kind === 'admitted') {
          try {
            await this.videoJobs.startPrelinked({
              jobId: input.operationId,
              ownerId: input.ownerUserId,
              requestFingerprint,
              recipe,
              inspectedInput: inspected,
              directory: paths.directory,
              inputPath: paths.inputPath,
              referencePath: referenceAssetId === null ? null : paths.referencePath,
              referenceMimeType,
            });
          } catch (error) {
            const failedAt = this.#now().toISOString();
            await this.processing.updateProjectAttemptTrace({
              schemaVersion: 1,
              jobId: attempt.operationId,
              ownerUserId: attempt.ownerUserId,
              operation: attempt.capability as 'character-swap' | 'virtual-try-on',
              provider: attempt.provider,
              providerJobId: null,
              requestFingerprint: attempt.requestFingerprint,
              outputResolution: attempt.outputResolution,
              providerOutputLocation: null,
              sourceDurationMs: attempt.sourceDurationMs,
              sourceOrientation: attempt.sourceOrientation,
              status: 'failed',
              safeErrorCode:
                error instanceof AppError &&
                [
                  'provider_unavailable',
                  'provider_billing',
                  'provider_rejected',
                  'provider_timeout',
                ].includes(error.code)
                  ? error.code
                  : 'processing_failed',
              createdAt: attempt.createdAt,
              updatedAt: failedAt,
              completedAt: failedAt,
            });
            throw error;
          }
        }
        const durable =
          (await this.processing.getProjectAttempt(
            input.ownerUserId,
            input.projectId,
            input.operationId,
          )) ?? admission.attempt;
        return projectProcessingMutationResponseSchema.parse({
          replayed: admission.kind === 'replayed',
          attempt: await this.#publicAttempt(input.ownerUserId, input.projectId, durable),
        });
      } catch (error) {
        await rm(paths.directory, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    });
  }

  async current(ownerUserId: string, projectId: string): Promise<ProjectProcessingCurrentResponse> {
    const attempt = await this.processing.getCurrentProjectAttempt(ownerUserId, projectId);
    const reconciled =
      attempt === null ? null : await this.#reconcile(ownerUserId, projectId, attempt.operationId);
    const latest = await this.#requireCurrent(ownerUserId, projectId);
    return projectProcessingCurrentResponseSchema.parse({
      projectId,
      currentProjectVersion: latest.project.version,
      currentRevisionId: latest.revision.id,
      currentRevisionNumber: latest.revision.revisionNumber,
      attempt:
        reconciled === null ? null : await this.#publicAttempt(ownerUserId, projectId, reconciled),
    });
  }

  async reconcile(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectProcessingMutationResponse> {
    const attempt = await this.#reconcile(ownerUserId, projectId, operationId);
    if (attempt === null) {
      throw new AppError(404, 'not_found', 'That Project processing attempt is unavailable.');
    }
    return projectProcessingMutationResponseSchema.parse({
      replayed: true,
      attempt: await this.#publicAttempt(ownerUserId, projectId, attempt),
    });
  }

  async #reconcile(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectProcessingAttemptRecord | null> {
    return this.#lock.run(`${ownerUserId}:${operationId}:reconcile`, async () => {
      let attempt = await this.processing.getProjectAttempt(ownerUserId, projectId, operationId);
      if (attempt === null) return null;
      if (
        attempt.outputAssetId === null &&
        (await this.bytes.exists(attempt.ownerUserId, attempt.resultAssetId))
      ) {
        attempt = await this.#retainResult(attempt);
        if (attempt.outputAssetId !== null) return attempt;
      }
      let volatileReady = false;
      if (
        attempt.providerJobId !== null &&
        (attempt.status === 'accepted' ||
          attempt.status === 'queued' ||
          attempt.status === 'processing' ||
          attempt.status === 'retrieving')
      ) {
        const volatile = await this.videoJobs.status(operationId, ownerUserId);
        volatileReady = volatile.status === 'ready';
        // The poll only writes a trace when the provider actually moved. Re-reading the attempt
        // when the volatile status still matches what is stored is a wasted three-table join on
        // every tick of a poll that runs for the whole life of the job.
        if (volatileReady || volatile.status !== attempt.status) {
          attempt =
            (await this.processing.getProjectAttempt(ownerUserId, projectId, operationId)) ??
            attempt;
        }
      }
      if ((attempt.status === 'ready' || volatileReady) && attempt.outputAssetId === null) {
        attempt = await this.#retainResult(attempt);
      }
      return attempt;
    });
  }

  async #retainResult(
    attempt: ProjectProcessingAttemptRecord,
  ): Promise<ProjectProcessingAttemptRecord> {
    let lease: Awaited<ReturnType<VideoJobService['content']>> | null = null;
    try {
      let asset = await this.bytes.open(attempt.ownerUserId, attempt.resultAssetId);
      let inspected: InspectedVideo;
      if (asset === null) {
        lease = await this.videoJobs.content(attempt.operationId, attempt.ownerUserId);
        inspected = lease.media;
        const manifest = await this.bytes.storeFile({
          assetId: attempt.resultAssetId,
          ownerUserId: attempt.ownerUserId,
          sourcePath: lease.path,
          mimeType: inspected.mimeType,
          filename: `${attempt.capability}-result.mp4`,
          createdAt: this.#now().toISOString(),
        });
        asset = await this.bytes.open(attempt.ownerUserId, manifest.assetId);
        if (asset === null) throw new Error('Retained Project result could not be reopened.');
      } else {
        inspected = await inspectStoredProjectMedia(asset, (filePath) =>
          inspectVideoFile(filePath, attempt.capability as 'character-swap' | 'virtual-try-on', {
            requireProviderOutputSize: true,
            expectedResolution: attempt.outputResolution,
            expectedDurationMs: attempt.sourceDurationMs,
            expectedOrientation: attempt.sourceOrientation,
            outputSizing: attempt.provider === 'pruna' ? 'megapixel-budget' : 'exact-canonical',
          }),
        );
      }
      const retainedAt = this.#now().toISOString();
      const current = await this.#requireCurrent(attempt.ownerUserId, attempt.projectId);
      const currentAttempt = await this.processing.getCurrentProjectAttempt(
        attempt.ownerUserId,
        attempt.projectId,
      );
      const promotion = promoteProjectJobResult(
        projectAggregateForCurrent(current),
        {
          expectedProjectVersion: current.project.version,
          expectedRevisionNumber: current.revision.revisionNumber,
          initiatingRevisionId: attempt.initiatingRevisionId,
          initiatingRevisionNumber: attempt.initiatingRevisionNumber,
          operationIsCurrent: currentAttempt?.operationId === attempt.operationId,
          operationId: attempt.operationId,
          assetId: attempt.resultAssetId,
          author: { kind: 'system', authorId: PROCESSING_SYSTEM_AUTHOR },
        },
        { now: retainedAt, createId: this.#createId },
      );
      if (promotion.kind === 'conflict') {
        throw new AppError(409, 'conflict', 'The Project changed while its result was retained.');
      }
      let currentPromotion: Parameters<
        ProjectProcessingRepository['retainProjectResult']
      >[0]['currentPromotion'] = null;
      if (promotion.kind === 'promoted') {
        const revision = promotion.value.revisions.at(-1)!;
        const media: ProjectWorkingMediaRecord = {
          projectId: attempt.projectId,
          ownerUserId: attempt.ownerUserId,
          kind: 'media-asset',
          mediaReference: { kind: 'asset', assetId: attempt.resultAssetId },
          assetId: attempt.resultAssetId,
          savedVideoId: null,
          videoVersionId: null,
          adoptedRevisionId: revision.id,
          adoptedRevisionNumber: revision.revisionNumber,
          operationKey: attempt.operationId,
          requestFingerprint: projectRequestFingerprint({
            version: 1,
            operation: 'retain-project-job-result',
            requestFingerprint: attempt.requestFingerprint,
            assetId: attempt.resultAssetId,
            checksumSha256: asset.manifest.checksumSha256,
            inspected,
          }),
          mimeType: inspected.mimeType,
          filename: asset.manifest.filename,
          sizeBytes: inspected.sizeBytes,
          checksumSha256: asset.manifest.checksumSha256,
          container: inspected.container,
          videoCodec: inspected.videoCodec,
          audioCodec: inspected.audioCodec,
          durationMs: Math.round(inspected.durationMs),
          width: inspected.width,
          height: inspected.height,
          hasAudio: inspected.hasAudio,
          adoptedAt: retainedAt,
        };
        currentPromotion = {
          expectedVersion: current.project.version,
          expectedRevisionNumber: current.revision.revisionNumber,
          expectedCurrentOperationId: attempt.operationId,
          revision: {
            ownerUserId: attempt.ownerUserId,
            projectId: attempt.projectId,
            expectedVersion: current.project.version,
            expectedRevisionNumber: current.revision.revisionNumber,
            nextProject: promotion.value.project,
            revision,
            assetLinks: projectAssetLinksForRevision(revision),
          },
          media,
        };
      }
      const jobOutputLink: ProjectAssetLink = {
        projectId: attempt.projectId,
        ownerUserId: attempt.ownerUserId,
        assetId: attempt.resultAssetId,
        role: 'job-output',
        revisionId: attempt.initiatingRevisionId,
        revisionNumber: attempt.initiatingRevisionNumber,
        createdAt: retainedAt,
      };
      const result = await this.processing.retainProjectResult({
        ownerUserId: attempt.ownerUserId,
        projectId: attempt.projectId,
        operationId: attempt.operationId,
        manifest: asset.manifest,
        inspected,
        jobOutputLink,
        currentPromotion,
        retainedAt,
      });
      if (result.kind === 'not-found') {
        throw new AppError(404, 'not_found', 'That Project processing attempt is unavailable.');
      }
      if (result.kind === 'conflict') {
        throw new AppError(409, 'conflict', 'Project result retention needs reconciliation.');
      }
      await lease?.settle(true);
      return result.attempt;
    } catch (error) {
      await lease?.settle(false).catch(() => undefined);
      throw error;
    }
  }

  async retry(input: {
    readonly ownerUserId: string;
    readonly projectId: string;
    readonly operationId: string;
    readonly previousOperationId: string;
    readonly expectedVersion: number;
    readonly expectedRevisionNumber: number;
    readonly capability: ProjectProcessingCapability;
    readonly acknowledgePossibleDuplicateCost: boolean;
  }): Promise<ProjectProcessingMutationResponse> {
    return this.submit({
      ...input,
      retryOfOperationId: input.previousOperationId,
    });
  }

  async cancel(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectProcessingMutationResponse> {
    let attempt = await this.processing.getProjectAttempt(ownerUserId, projectId, operationId);
    if (attempt === null) {
      throw new AppError(404, 'not_found', 'That Project processing attempt is unavailable.');
    }
    if (LOCALLY_STOPPABLE_PROCESSING_STATUSES.has(attempt.status)) {
      await this.videoJobs.abandon(operationId, ownerUserId);
      attempt =
        (await this.processing.getProjectAttempt(ownerUserId, projectId, operationId)) ?? attempt;
    }
    return projectProcessingMutationResponseSchema.parse({
      replayed: true,
      attempt: await this.#publicAttempt(ownerUserId, projectId, attempt),
    });
  }

  async history(
    ownerUserId: string,
    projectId: string,
    query: ProjectProcessingHistoryQuery,
  ): Promise<ProjectProcessingHistoryResponse> {
    const cursor = parseHistoryCursor(query.cursor);
    const page = await this.processing.listProjectAttempts(ownerUserId, projectId, {
      ...(cursor === undefined ? {} : { cursor }),
      pageSize: query.pageSize,
    });
    if (page === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    const supersededOperationIds = new Set(page.supersededOperationIds);
    return projectProcessingHistoryResponseSchema.parse({
      attempts: page.attempts.map((attempt) =>
        this.#formatPublicAttempt(
          projectId,
          attempt,
          page.currentOperationId,
          supersededOperationIds.has(attempt.operationId),
        ),
      ),
      nextCursor: page.nextCursor === null ? null : historyCursor(page.nextCursor),
    });
  }

  async content(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<AssetReadHandle> {
    const attempt = await this.processing.getProjectAttempt(ownerUserId, projectId, operationId);
    if (attempt === null || attempt.outputAssetId === null || attempt.result === null) {
      throw new AppError(404, 'not_found', 'That retained Project result is unavailable.');
    }
    const asset = await this.bytes.open(ownerUserId, attempt.outputAssetId);
    if (asset === null) {
      throw new AppError(404, 'asset_missing', 'That retained Project result is unavailable.');
    }
    return asset;
  }

  async #publicAttempt(
    ownerUserId: string,
    projectId: string,
    attempt: ProjectProcessingAttemptRecord,
  ): Promise<ProjectProcessingAttempt> {
    const currentAttempt = await this.processing.getCurrentProjectAttempt(ownerUserId, projectId);
    const ambiguitySuperseded =
      attempt.status === 'ambiguous' &&
      (await this.processing.isProjectAttemptSuperseded(
        ownerUserId,
        projectId,
        attempt.operationId,
      ));
    return this.#formatPublicAttempt(
      projectId,
      attempt,
      currentAttempt?.operationId ?? null,
      ambiguitySuperseded,
    );
  }

  #formatPublicAttempt(
    projectId: string,
    attempt: ProjectProcessingAttemptRecord,
    currentOperationId: string | null,
    ambiguitySuperseded: boolean,
  ): ProjectProcessingAttempt {
    const isCurrent = currentOperationId === attempt.operationId;
    const phase = projectProcessingPhase(attempt);
    const error =
      phase === 'needs-attention'
        ? safeErrorMessage(attempt.safeErrorCode, attempt.provider)
        : null;
    return projectProcessingAttemptSchema.parse({
      operationId: attempt.operationId,
      projectId: attempt.projectId,
      capability: attempt.capability,
      attemptNumber: attempt.attemptNumber,
      retryOfOperationId: attempt.retryOfOperationId,
      initiatingRevisionId: attempt.initiatingRevisionId,
      initiatingRevisionNumber: attempt.initiatingRevisionNumber,
      phase,
      isCurrent,
      ambiguous: attempt.status === 'ambiguous',
      cancellation:
        attempt.status === 'cancelled'
          ? 'cancelled'
          : LOCALLY_STOPPABLE_PROCESSING_STATUSES.has(attempt.status)
            ? 'available'
            : 'unsupported',
      retryPolicy: projectProcessingRetryPolicy(attempt.status),
      blocksArchive: projectProcessingBlocksArchive(attempt.status) && !ambiguitySuperseded,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      acceptedAt: attempt.acceptedAt,
      completedAt: attempt.completedAt,
      expiresAt: attempt.expiresAt,
      nextPollAfterMs: [
        'submitting',
        'accepted',
        'processing',
        'retrieving',
        'saving-result',
      ].includes(phase)
        ? PROCESSING_POLL_AFTER_MS
        : null,
      result:
        attempt.outputAssetId === null || attempt.result === null
          ? null
          : {
              assetId: attempt.outputAssetId,
              retainedAt: attempt.completedAt ?? attempt.updatedAt,
              historical: !isCurrent,
              media: attempt.result,
              contentUrl: `/api/projects/${encodeURIComponent(projectId)}/processing/${encodeURIComponent(attempt.operationId)}/result/content`,
            },
      error,
    });
  }
}
