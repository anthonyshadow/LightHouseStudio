import { useTheme } from '@emotion/react';
import {
  createPromptBuilderDraft,
  generateStructuredPrompt,
  type CharacterTransformDraft,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  detectBrowserCapabilities,
  hasLiveAudio,
  hasLiveVideo,
} from '../../adapters/browser-media/browserMedia';
import {
  fetchReferenceImageMetadata,
  hydrateReferenceImage,
  type PersistedReferenceImage,
} from '../../adapters/api-client/apiClient';
import { createCreativeAssetRepository, type CreativeAssetRepository } from '../creative-assets';
import {
  createInitialGuidedFlowState,
  createLocalProjectRepository,
  createNoopGuidedFlowTelemetry,
  guidedFlowReducer,
  requestPersistentProjectStorage,
  type GuidedFlowEvent,
  type GuidedFlowState,
  type GuidedProjectCheckpoint,
  type GuidedProjectDataV1,
  type ProjectArtifactCommit,
  type ProjectRecordV1,
  type ProjectStorageState,
} from '../guided-flow';
import type { VoiceSummary } from '../voice-effects/types';
import { useRecording, useRecordingSource } from '../../orchestration/recording';
import { useStudioSession } from '../../orchestration/session';
import { useVoiceProcessing } from '../../orchestration/voice-processing';
import { useProviderAvailability } from '../../studio/useProviderAvailability';
import { StatusNotice } from '../../ui';
import { createEmptyGuidedDesign } from './GuidedCharacterBuilder';
import { GuidedCreateStage } from './GuidedCreateStage';
import type { GeneratedGuidedReference } from './GuidedReferencePanel';
import { contentCardStyles, guidedPageStyles, guidedShellStyles } from './GuidedExperience.styles';
import { GuidedProgressHeader, GuidedStorageRecovery } from './GuidedExperienceChrome';
import { GuidedProjectBrowser } from './GuidedProjectBrowser';
import { GuidedDownloadStage } from './GuidedDownloadStage';
import { GuidedLiveStage } from './GuidedLiveStage';
import { GuidedRecordStage } from './GuidedRecordStage';
import { GuidedVoiceStage } from './GuidedVoiceStage';
import {
  createOperationId as operationId,
  friendlyError,
  GUIDED_AI_READY_TIMEOUT_MS,
  projectTitle,
  readableFilename,
  RECONNECT_BEFORE_RECORD_SECONDS,
  RECORDING_LIMIT_SECONDS,
  stageForStatus,
} from './guidedExperienceModel';
import { reconcileGuidedRestore, restoreCharacterEditingState } from './guidedProjectRestore';
import { useGuidedStageMedia } from './useGuidedStageMedia';
import { useAcceptedCameraStart } from './useAcceptedCameraStart';

type SendEvent = (event: GuidedFlowEvent) => void;

export type GuidedExperienceProps = {
  initialProjectId?: string | null;
  projectsOnly?: boolean;
  resumeLatest?: boolean;
};

export const GuidedExperience = ({
  initialProjectId = null,
  projectsOnly = false,
  resumeLatest = true,
}: GuidedExperienceProps) => {
  const theme = useTheme();
  const browser = useMemo(() => detectBrowserCapabilities(), []);
  const repository = useMemo(() => createLocalProjectRepository(), []);
  const shelf = useMemo<CreativeAssetRepository>(() => createCreativeAssetRepository(), []);
  const telemetry = useMemo(() => createNoopGuidedFlowTelemetry(), []);
  const repositoryCloseTimerRef = useRef<number | null>(null);
  const projectIdRef = useRef(initialProjectId ?? crypto.randomUUID());
  const [restoreProjectId, setRestoreProjectId] = useState(initialProjectId);
  const revisionRef = useRef(0);
  const [flow, setFlow] = useState<GuidedFlowState>(() =>
    createInitialGuidedFlowState(projectIdRef.current),
  );
  const [storage, setStorage] = useState<ProjectStorageState>({
    health: 'session-only',
    durable: false,
    notice: 'Preparing browser-local project storage…',
  });
  const [storageDismissed, setStorageDismissed] = useState(false);
  const [draft, setDraft] = useState<CharacterTransformDraft>(() =>
    createPromptBuilderDraft('character-transform'),
  );
  const [design, setDesign] = useState(createEmptyGuidedDesign);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [preparingCharacterSave, setPreparingCharacterSave] = useState(false);
  const savedCharacterIdRef = useRef<string | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [permissionPrimer, setPermissionPrimer] = useState(false);
  const [aiStartQueued, setAiStartQueued] = useState(false);
  const aiStartQueuedRef = useRef(false);
  const updateAiStartQueued = useCallback((queued: boolean) => {
    aiStartQueuedRef.current = queued;
    setAiStartQueued(queued);
  }, []);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const countdownStartedRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const pendingRecordRefreshRef = useRef<{ id: string; baseRevision: number } | null>(null);
  const [refreshingForRecord, setRefreshingForRecord] = useState(false);
  const [voiceLibraryLoaded, setVoiceLibraryLoaded] = useState(false);
  const [voicePreviewVariant, setVoicePreviewVariant] = useState<'original' | 'processed'>(
    'processed',
  );
  const [restoring, setRestoring] = useState(
    !projectsOnly && (Boolean(initialProjectId) || resumeLatest),
  );
  const [downloadStarted, setDownloadStarted] = useState(false);
  const automaticRecordingStopRef = useRef<() => void>(() => undefined);

  const {
    availability,
    state: capabilityState,
    retry: retryCapabilities,
  } = useProviderAvailability();
  const session = useStudioSession({ availability, realtimeSessionProfile: 'guided' });
  const startLocalSession = session.startLocal;
  const stopSessionModel = session.stopModel;
  const recording = useRecording({
    onAutomaticStop: () => automaticRecordingStopRef.current(),
  });
  const processing = useVoiceProcessing(recording);
  const recordingSource = useRecordingSource(
    session.draft.mode,
    session.localStream,
    session.transformedVideoUsable ? session.remoteStream : null,
  );
  const cameraReady = hasLiveVideo(session.localStream);
  const microphoneReady = hasLiveAudio(session.localStream);
  const localPreviewReady = cameraReady && microphoneReady;
  const replaceRestoredRecipe = session.replaceRecipeDraft;
  const restorePersistedOriginal = recording.restorePersistedOriginal;
  const restorePersistedProcessed = recording.completeProcessing;

  const send: SendEvent = useCallback((event) => {
    setFlow((current) => guidedFlowReducer(current, event).state);
  }, []);

  const trackCheckpoint = useCallback(
    (checkpoint: GuidedProjectCheckpoint, revision: number) => {
      telemetry.track({
        type: 'guided-checkpoint-saved',
        checkpoint,
        projectRevision: revision,
        storageHealth: repository.getStorageState().health,
        timestamp: new Date().toISOString(),
      });
      setStorage(repository.getStorageState());
    },
    [repository, telemetry],
  );

  const commitProject = useCallback(
    async (
      checkpoint: GuidedProjectCheckpoint,
      data: GuidedProjectDataV1,
      baseRevision: number,
      artifacts: readonly ProjectArtifactCommit[] = [],
      removeArtifactIds: readonly string[] = [],
    ): Promise<ProjectRecordV1> => {
      const record = await repository.commit({
        projectId: projectIdRef.current,
        expectedRevision: baseRevision === 0 ? null : baseRevision,
        title: projectTitle(data.characterName),
        checkpoint,
        data,
        ...(artifacts.length ? { artifacts } : {}),
        ...(removeArtifactIds.length ? { removeArtifactIds } : {}),
      });
      revisionRef.current = record.revision;
      trackCheckpoint(checkpoint, record.revision);
      return record;
    },
    [repository, trackCheckpoint],
  );

  useEffect(() => {
    let active = true;
    if (repositoryCloseTimerRef.current !== null) {
      window.clearTimeout(repositoryCloseTimerRef.current);
      repositoryCloseTimerRef.current = null;
    }
    void repository
      .initialize()
      .then(async (nextStorage) => {
        if (!active) return;
        setStorage(nextStorage);
        let resumedProjectId = initialProjectId;
        if (!resumedProjectId && resumeLatest && !projectsOnly) {
          const recent = (await repository.list()).find(
            (project) => project.checkpoint !== 'complete',
          );
          resumedProjectId = recent?.id ?? null;
          if (resumedProjectId) setRestoreProjectId(resumedProjectId);
          else setRestoring(false);
        }
        telemetry.track({
          type: 'guided-flow-entered',
          entry: resumedProjectId ? 'resume' : 'default',
          projectRevision: 0,
          timestamp: new Date().toISOString(),
        });
      })
      .catch(() => {
        if (!active) return;
        setStorage(repository.getStorageState());
        setRestoring(false);
      });
    return () => {
      active = false;
      processing.cancel();
      session.stopCamera();
      repositoryCloseTimerRef.current = window.setTimeout(() => repository.close(), 0);
    };
    // Resource owners intentionally bind to this component lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    telemetry.track({
      type: 'guided-stage-viewed',
      stage: stageForStatus(flow.status),
      projectRevision: flow.projectRevision,
      timestamp: new Date().toISOString(),
    });
  }, [flow.projectRevision, flow.status, telemetry]);

  useEffect(() => {
    if (projectsOnly || !restoreProjectId) {
      if (!resumeLatest) setRestoring(false);
      return;
    }
    let active = true;
    void repository
      .load(restoreProjectId)
      .then(async (project) => {
        if (!active || !project) return;
        projectIdRef.current = project.id;
        revisionRef.current = project.revision;
        savedCharacterIdRef.current = project.data.characterId;
        const saved = shelf
          .getSnapshot()
          .store.savedCharacterPrompts.find(
            (candidate) => candidate.id === project.data.characterId,
          );
        const editing = restoreCharacterEditingState(
          project.data,
          saved?.builderDraft?.intent === 'character-transform' ? saved.builderDraft : null,
        );
        setDraft(editing.draft);
        setDesign(editing.design);

        let reference: PersistedReferenceImage | null = null;
        let livePrompt = project.data.characterPrompt;
        let referenceMissing = false;
        if (project.data.referenceImageAssetId && !project.data.referenceImageStale) {
          try {
            const metadata = await fetchReferenceImageMetadata(project.data.referenceImageAssetId);
            reference = await hydrateReferenceImage(project.data.referenceImageAssetId, metadata);
            livePrompt = metadata.lucy25CharacterPrompt;
          } catch {
            referenceMissing = true;
          }
        }

        const [originalBlob, audioBlob] = await Promise.all([
          project.data.originalVideoArtifactId
            ? repository
                .readArtifact(project.id, project.data.originalVideoArtifactId)
                .catch(() => null)
            : Promise.resolve(null),
          project.data.originalAudioArtifactId
            ? repository
                .readArtifact(project.id, project.data.originalAudioArtifactId)
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        const processedBlob = project.data.processedVideoArtifactId
          ? await repository
              .readArtifact(project.id, project.data.processedVideoArtifactId)
              .catch(() => null)
          : null;
        const checkpointNeedsOriginal =
          project.checkpoint !== 'character-design' && project.checkpoint !== 'character-ready';
        const checkpointNeedsProcessed =
          project.checkpoint === 'processed-voice' || project.data.finalVariant === 'processed';
        const reconciled = reconcileGuidedRestore(project, {
          referenceMissing,
          originalMissing:
            checkpointNeedsOriginal &&
            (!project.data.originalVideoArtifactId ||
              !project.data.originalVideoMetadata ||
              !originalBlob),
          processedMissing:
            checkpointNeedsProcessed && (!project.data.processedVideoArtifactId || !processedBlob),
        });
        setFlow(reconciled.flow);
        setReferencePreviewUrl(reference?.contentUrl ?? null);
        replaceRestoredRecipe({
          mode: 'lucy-2.5',
          prompt: livePrompt,
          referenceImage: reference,
          enhance: Boolean(reference),
        });
        if (
          originalBlob &&
          reconciled.flow.data.originalVideoArtifactId &&
          reconciled.flow.data.originalVideoMetadata
        ) {
          const metadata = reconciled.flow.data.originalVideoMetadata;
          restorePersistedOriginal({
            blob: originalBlob,
            artifactMetadata: {
              id: reconciled.flow.data.originalVideoArtifactId,
              mimeType: metadata.mimeType,
              filename: metadata.filename,
              sourceModeId:
                metadata.sourceModeId === 'local' || metadata.sourceModeId === 'lucy-vton-3'
                  ? metadata.sourceModeId
                  : 'lucy-2.5',
              startedAt: metadata.startedAt,
              durationMs: metadata.durationMs,
            },
            takeMetadata: null,
            audioSidecar:
              audioBlob && reconciled.flow.data.originalAudioMimeType
                ? { blob: audioBlob, mimeType: reconciled.flow.data.originalAudioMimeType }
                : null,
          });
          if (processedBlob && reconciled.flow.data.processedVideoArtifactId) {
            restorePersistedProcessed(
              processedBlob,
              reconciled.flow.data.processedVideoMetadata?.mimeType ?? processedBlob.type,
              'restored-voice',
            );
          }
        }
      })
      .catch((caught: unknown) =>
        setBuilderError(friendlyError(caught, 'This project could not be restored.')),
      )
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [
    projectsOnly,
    replaceRestoredRecipe,
    repository,
    restorePersistedOriginal,
    restorePersistedProcessed,
    restoreProjectId,
    resumeLatest,
    shelf,
  ]);

  const autoSaveKeyRef = useRef('');
  const autoSavePromiseRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (flow.status !== 'create.editing' || !design.starterId || flow.pending) return;
    const prompt = generateStructuredPrompt(draft).prompt;
    const data: GuidedProjectDataV1 = {
      ...flow.data,
      characterName:
        flow.data.characterName ||
        `${design.starterId
          .split('-')
          .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
          .join(' ')} 01`,
      characterPrompt: prompt,
      characterDraft: draft,
      guidedDesign: design,
      referenceImageStale: flow.data.referenceImageStale,
    };
    const key = JSON.stringify({ draft, design, data: flow.data.referenceImageAssetId });
    if (key === autoSaveKeyRef.current) return;
    const timer = window.setTimeout(() => {
      const baseRevision = revisionRef.current;
      const promise = commitProject('character-design', data, baseRevision)
        .then((record) => {
          autoSaveKeyRef.current = key;
          setFlow((current) =>
            current.status === 'create.editing'
              ? { ...current, projectRevision: record.revision, data: record.data }
              : current,
          );
        })
        .catch(() => setStorage(repository.getStorageState()))
        .then(() => undefined);
      autoSavePromiseRef.current = promise;
      void promise.finally(() => {
        if (autoSavePromiseRef.current === promise) autoSavePromiseRef.current = null;
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [commitProject, design, draft, flow.data, flow.pending, flow.status, repository]);

  const handleBuilderChange = (nextDraft: CharacterTransformDraft, nextDesign: typeof design) => {
    setDraft(nextDraft);
    setDesign(nextDesign);
    setBuilderError(null);
    const stale = Boolean(flow.data.referenceImageAssetId) || flow.data.referenceImageStale;
    send({
      type: 'character-edited',
      data: {
        characterDraft: nextDraft,
        guidedDesign: nextDesign,
        referenceImageStale: stale,
      },
    });
  };

  const requestSaveCharacter = async () => {
    if (preparingCharacterSave) return;
    const generated = generateStructuredPrompt(draft);
    if (!design.starterId) {
      setBuilderError('Choose one of the nine starter characters before saving.');
      return;
    }
    if (!generated.validation.valid || !generated.prompt) {
      setBuilderError(
        generated.validation.blockingIssues[0]?.message ??
          'Complete the adult character direction before saving.',
      );
      return;
    }
    setPreparingCharacterSave(true);
    await autoSavePromiseRef.current;
    const name =
      flow.data.characterName ||
      `${design.starterId
        .split('-')
        .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
        .join(' ')} 01`;
    send({
      type: 'character-save-prepared',
      data: {
        characterName: name,
        characterPrompt: generated.prompt,
        characterDraft: draft,
        guidedDesign: design,
      },
      projectRevision: revisionRef.current,
    });
    send({ type: 'save-character-requested' });
    setPreparingCharacterSave(false);
  };

  const failOperation = useCallback(
    (id: string, baseRevision: number, message: string) => {
      send({ type: 'operation-failed', operationId: id, baseRevision, message });
    },
    [send],
  );

  const saveCharacter = useCallback(
    async ({
      id,
      baseRevision,
      referenceMode,
      reference,
      referenceAssetId,
      livePrompt,
    }: {
      id: string;
      baseRevision: number;
      referenceMode: 'prompt-only' | 'generate' | 'existing';
      reference: PersistedReferenceImage | null;
      referenceAssetId: string | null;
      livePrompt: string;
    }) => {
      try {
        if ((reference?.assetId ?? null) !== referenceAssetId) {
          throw new Error('The generated reference did not match the character being saved.');
        }
        const existingId = savedCharacterIdRef.current ?? flow.data.characterId;
        const existingCharacter = existingId
          ? shelf
              .getSnapshot()
              .store.savedCharacterPrompts.some((character) => character.id === existingId)
          : false;
        const saved =
          existingId && existingCharacter
            ? shelf.updateSavedCharacterPrompt(existingId, {
                name: flow.data.characterName,
                prompt: flow.data.characterPrompt,
                builderDraft: draft,
                guidedDesign: design,
                referenceImageStatus: referenceAssetId ? 'persisted-reference' : 'prompt-only',
                referenceImageAssetId: referenceAssetId,
              })
            : shelf.createSavedCharacterPrompt({
                name: flow.data.characterName,
                prompt: flow.data.characterPrompt,
                source: 'generator',
                promptIntent: 'character-transform',
                builderDraft: draft,
                guidedDesign: design,
                referenceImageStatus: referenceAssetId ? 'persisted-reference' : 'prompt-only',
                referenceImageAssetId: referenceAssetId,
              });
        savedCharacterIdRef.current = saved.id;
        setReferencePreviewUrl(reference?.contentUrl ?? null);
        const committed = session.replaceRecipeDraft({
          mode: 'lucy-2.5',
          prompt: livePrompt,
          referenceImage: reference,
          enhance: Boolean(reference),
        });
        if (!committed)
          throw new Error('Stop the current media session before replacing the character.');
        const data: GuidedProjectDataV1 = {
          ...flow.data,
          characterId: saved.id,
          characterDraft: draft,
          guidedDesign: design,
          referenceMode,
          referenceImageAssetId: referenceAssetId,
          referenceImageStale: false,
        };
        const record = await commitProject('character-ready', data, baseRevision);
        send({
          type: 'character-saved',
          operationId: id,
          baseRevision,
          nextRevision: record.revision,
          data,
        });
      } catch (caught) {
        const message = friendlyError(caught, 'The character could not be saved.');
        failOperation(id, baseRevision, message);
        throw new Error(message, { cause: caught });
      }
    },
    [commitProject, design, draft, failOperation, flow.data, send, session, shelf],
  );

  const choosePromptOnly = () => {
    const id = operationId('save-character-prompt-only');
    const baseRevision = flow.projectRevision;
    send({ type: 'reference-mode-selected', mode: 'prompt-only', operationId: id });
    void saveCharacter({
      id,
      baseRevision,
      referenceMode: 'prompt-only',
      reference: null,
      referenceAssetId: null,
      livePrompt: flow.data.characterPrompt,
    }).catch(() => undefined);
  };

  const chooseExistingReference = async () => {
    const assetId = flow.data.referenceImageAssetId;
    if (!assetId || flow.data.referenceImageStale) return;
    const id = operationId('reuse-character-reference');
    const baseRevision = flow.projectRevision;
    send({ type: 'reference-mode-selected', mode: 'existing', operationId: id });
    try {
      const metadata = await fetchReferenceImageMetadata(assetId);
      const reference = await hydrateReferenceImage(assetId, metadata);
      await saveCharacter({
        id,
        baseRevision,
        referenceMode: 'existing',
        reference,
        referenceAssetId: assetId,
        livePrompt: metadata.lucy25CharacterPrompt,
      });
    } catch (caught) {
      failOperation(
        id,
        baseRevision,
        friendlyError(caught, 'The existing reference could not be reused.'),
      );
    }
  };

  const handleGeneratedReference = async (result: GeneratedGuidedReference) => {
    const reference = await hydrateReferenceImage(result.asset.assetId, result.asset);
    const id = operationId('save-character-with-reference');
    const baseRevision = flow.projectRevision;
    send({ type: 'reference-generation-confirmed', operationId: id });
    await saveCharacter({
      id,
      baseRevision,
      referenceMode: 'generate',
      reference,
      referenceAssetId: result.asset.assetId,
      livePrompt: result.livePrompt,
    });
  };

  const cameraStartInFlightRef = useRef(false);
  const cameraPrimerOpenRef = useRef(false);
  const confirmCameraStart = () => {
    // Button state is rendered asynchronously, so guard the operation before a
    // second pointer/touch event can replace the reducer's accepted operation id.
    if (!cameraPrimerOpenRef.current || cameraStartInFlightRef.current) return;
    cameraPrimerOpenRef.current = false;
    const id = operationId('start-camera-preview');
    cameraStartInFlightRef.current = true;
    send({ type: 'live-permission-confirmed', operationId: id });
    setPermissionPrimer(false);
  };

  const cancelCameraStart = () => {
    cameraPrimerOpenRef.current = false;
    cameraStartInFlightRef.current = false;
    setPermissionPrimer(false);
    send({ type: 'live-permission-cancelled' });
  };

  const requestCameraStart = () => {
    cameraPrimerOpenRef.current = true;
    cameraStartInFlightRef.current = false;
    send({ type: 'live-start-requested' });
    setPermissionPrimer(true);
  };

  const pendingCameraOperation =
    flow.status === 'live.camera-starting' && flow.pending?.kind === 'start-camera-preview'
      ? flow.pending
      : null;
  useAcceptedCameraStart(pendingCameraOperation, startLocalSession);
  useEffect(() => {
    // The reducer owns the accepted operation identity. The ref only prevents
    // duplicate side effects and must never be authoritative for completion.
    const pending = pendingCameraOperation;
    if (!pending) return;
    if (localPreviewReady) {
      cameraStartInFlightRef.current = false;
      send({
        type: 'camera-preview-started',
        operationId: pending.id,
        baseRevision: pending.baseRevision,
      });
      return;
    }
    if (session.error && session.lifecycle !== 'requesting-media') {
      cameraStartInFlightRef.current = false;
      failOperation(pending.id, pending.baseRevision, session.error.message);
    }
  }, [
    failOperation,
    localPreviewReady,
    pendingCameraOperation,
    send,
    session.error,
    session.lifecycle,
  ]);

  useEffect(() => {
    if (
      !localPreviewReady ||
      !['live.ready', 'live.permission-primer', 'live.camera-starting'].includes(flow.status)
    )
      return;
    cameraStartInFlightRef.current = false;
    cameraPrimerOpenRef.current = false;
    setPermissionPrimer(false);
    send({ type: 'local-preview-reconciled' });
  }, [flow.status, localPreviewReady, send]);

  const aiStartInFlightRef = useRef(false);
  const beginAiSession = useCallback(() => {
    if (flow.status !== 'live.camera-ready' || aiStartInFlightRef.current) return;
    const id = operationId('start-live-session');
    send({ type: 'ai-start-requested', operationId: id });
    aiStartInFlightRef.current = true;
    void session.startModel();
  }, [flow.status, send, session]);

  const startAi = () => {
    if (aiStartInFlightRef.current || aiStartQueuedRef.current) return;
    session.clearError();
    if (!localPreviewReady) return;
    const providerReady = capabilityState === 'ready' && availability.decart;
    if (flow.status !== 'live.camera-ready') {
      updateAiStartQueued(true);
      cameraStartInFlightRef.current = false;
      setPermissionPrimer(false);
      send({ type: 'local-preview-reconciled' });
      if (!providerReady) retryCapabilities();
      return;
    }
    if (providerReady) {
      beginAiSession();
      return;
    }
    updateAiStartQueued(true);
    retryCapabilities();
  };

  useEffect(() => {
    if (!aiStartQueued || capabilityState === 'loading' || flow.status !== 'live.camera-ready')
      return;
    updateAiStartQueued(false);
    if (capabilityState === 'ready' && availability.decart) {
      beginAiSession();
      return;
    }
    setFlow((current) => ({
      ...current,
      error:
        capabilityState === 'error'
          ? 'AI availability could not be checked. Keep your camera on and try Start AI Session again.'
          : 'Realtime AI is not configured on the local server. Add the Decart key, then try Start AI Session again.',
    }));
  }, [
    aiStartQueued,
    availability.decart,
    beginAiSession,
    capabilityState,
    flow.status,
    updateAiStartQueued,
  ]);

  const pendingLiveOperation =
    flow.status === 'live.connecting' && flow.pending?.kind === 'start-live-session'
      ? flow.pending
      : null;
  useEffect(() => {
    const pending = pendingLiveOperation;
    if (!pending) return;
    if (session.transformedVideoUsable) {
      aiStartInFlightRef.current = false;
      connectedAtRef.current = Date.now();
      send({
        type: 'live-connected',
        operationId: pending.id,
        baseRevision: pending.baseRevision,
      });
      return;
    }
    if (
      session.error &&
      !['requesting-media', 'requesting-token', 'connecting', 'reconnecting'].includes(
        session.lifecycle,
      )
    ) {
      aiStartInFlightRef.current = false;
      failOperation(pending.id, pending.baseRevision, session.error.message);
    }
  }, [
    failOperation,
    pendingLiveOperation,
    send,
    session.error,
    session.lifecycle,
    session.transformedVideoUsable,
  ]);

  useEffect(() => {
    if (
      !session.transformedVideoUsable ||
      !['live.camera-ready', 'live.connecting'].includes(flow.status)
    )
      return;
    aiStartInFlightRef.current = false;
    if (connectedAtRef.current === null) connectedAtRef.current = Date.now();
    send({ type: 'ai-preview-reconciled' });
  }, [flow.status, send, session.transformedVideoUsable]);

  useEffect(() => {
    if (!pendingLiveOperation) return;
    const timer = window.setTimeout(() => {
      aiStartInFlightRef.current = false;
      stopSessionModel();
      failOperation(
        pendingLiveOperation.id,
        pendingLiveOperation.baseRevision,
        'AI did not provide a live transformed video in time. Your local preview is still available; try Start AI Session again.',
      );
    }, GUIDED_AI_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [failOperation, pendingLiveOperation, stopSessionModel]);

  const continueToRecord = () => {
    if (!session.transformedVideoUsable) return;
    if (flow.status !== 'live.connected') {
      aiStartInFlightRef.current = false;
      if (connectedAtRef.current === null) connectedAtRef.current = Date.now();
      send({ type: 'ai-preview-reconciled' });
    }
    send({ type: 'continue-to-record' });
  };

  const pendingRecordRefreshOperation =
    flow.status === 'record.refreshing' && flow.pending?.kind === 'refresh-live-session'
      ? flow.pending
      : null;
  useEffect(() => {
    const pending = pendingRecordRefreshOperation;
    if (!pending) return;
    if (session.transformedVideoUsable) {
      pendingRecordRefreshRef.current = null;
      connectedAtRef.current = Date.now();
      setRefreshingForRecord(false);
      send({
        type: 'record-session-refreshed',
        operationId: pending.id,
        baseRevision: pending.baseRevision,
        endsAt: Date.now() + 3_000,
      });
      return;
    }
    if (
      session.error &&
      !['requesting-media', 'requesting-token', 'connecting', 'reconnecting'].includes(
        session.lifecycle,
      )
    ) {
      pendingRecordRefreshRef.current = null;
      setRefreshingForRecord(false);
      failOperation(pending.id, pending.baseRevision, session.error.message);
    }
  }, [
    failOperation,
    pendingRecordRefreshOperation,
    send,
    session.error,
    session.lifecycle,
    session.transformedVideoUsable,
  ]);

  useEffect(() => {
    if (!pendingRecordRefreshOperation) return;
    const timer = window.setTimeout(() => {
      pendingRecordRefreshRef.current = null;
      setRefreshingForRecord(false);
      stopSessionModel();
      failOperation(
        pendingRecordRefreshOperation.id,
        pendingRecordRefreshOperation.baseRevision,
        'The refreshed AI session did not provide video in time. Your local preview is still available; reconnect AI and try recording again.',
      );
    }, GUIDED_AI_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [failOperation, pendingRecordRefreshOperation, stopSessionModel]);

  const stopAi = () => {
    updateAiStartQueued(false);
    aiStartInFlightRef.current = false;
    pendingRecordRefreshRef.current = null;
    pendingRecordStartRef.current = null;
    countdownStartedRef.current = false;
    setRefreshingForRecord(false);
    connectedAtRef.current = null;
    session.stopModel();
    session.clearError();
    send({ type: 'ai-stopped' });
  };

  const stopCamera = () => {
    updateAiStartQueued(false);
    cameraStartInFlightRef.current = false;
    cameraPrimerOpenRef.current = false;
    aiStartInFlightRef.current = false;
    pendingRecordRefreshRef.current = null;
    pendingRecordStartRef.current = null;
    countdownStartedRef.current = false;
    connectedAtRef.current = null;
    setRefreshingForRecord(false);
    session.stopCamera();
    send({ type: 'camera-stopped' });
  };

  useEffect(() => {
    if (
      ![
        'live.connected',
        'record.ready',
        'record.refreshing',
        'record.countdown',
        'record.starting',
      ].includes(flow.status) ||
      flow.pending?.kind === 'refresh-live-session' ||
      session.transformedVideoUsable
    ) {
      return;
    }
    send({ type: hasLiveVideo(session.localStream) ? 'ai-disconnected' : 'camera-stopped' });
  }, [flow.pending?.kind, flow.status, send, session.localStream, session.transformedVideoUsable]);

  const beginCountdown = () => {
    if (!recordingSource || !session.transformedVideoUsable || pendingRecordRefreshRef.current)
      return;
    const connectedSeconds = connectedAtRef.current
      ? Math.floor((Date.now() - connectedAtRef.current) / 1_000)
      : 0;
    if (connectedSeconds >= RECONNECT_BEFORE_RECORD_SECONDS) {
      const id = operationId('refresh-live-session');
      const baseRevision = flow.projectRevision;
      pendingRecordRefreshRef.current = { id, baseRevision };
      send({ type: 'record-session-refresh-requested', operationId: id });
      setRefreshingForRecord(true);
      session.stopModel();
      void session.startModel();
      return;
    }
    send({ type: 'countdown-started', endsAt: Date.now() + 3_000 });
  };

  const pendingRecordStartRef = useRef<{ id: string; baseRevision: number } | null>(null);
  const startRecordingAfterCountdown = useCallback(() => {
    if (!recordingSource || countdownStartedRef.current) return;
    countdownStartedRef.current = true;
    const id = operationId('start-recording');
    const baseRevision = flow.projectRevision;
    send({ type: 'countdown-finished', operationId: id });
    pendingRecordStartRef.current = { id, baseRevision };
    void recording.start(recordingSource, 'lucy-2.5');
  }, [flow.projectRevision, recording, recordingSource, send]);

  useEffect(() => {
    if (flow.status !== 'record.countdown' || flow.countdownEndsAt === null) {
      setCountdownValue(null);
      countdownStartedRef.current = false;
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((flow.countdownEndsAt! - Date.now()) / 1_000));
      setCountdownValue(remaining || 1);
      if (Date.now() >= flow.countdownEndsAt!) startRecordingAfterCountdown();
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [flow.countdownEndsAt, flow.status, startRecordingAfterCountdown]);

  useEffect(() => {
    const pending =
      flow.status === 'record.starting' && flow.pending?.kind === 'start-recording'
        ? flow.pending
        : null;
    if (!pending) return;
    if (recording.lifecycle === 'recording') {
      pendingRecordStartRef.current = null;
      send({
        type: 'recording-started',
        operationId: pending.id,
        baseRevision: pending.baseRevision,
        deadlineAt: Date.now() + RECORDING_LIMIT_SECONDS * 1_000,
      });
    } else if (recording.lifecycle === 'error') {
      pendingRecordStartRef.current = null;
      failOperation(
        pending.id,
        pending.baseRevision,
        recording.recordingError ?? 'The browser could not start recording.',
      );
    }
  }, [
    failOperation,
    flow.pending,
    flow.status,
    recording.lifecycle,
    recording.recordingError,
    send,
  ]);

  const pendingFinalizeRef = useRef<{ id: string; baseRevision: number } | null>(null);
  const finalizedOperationRef = useRef<string | null>(null);
  const finishRecording = useCallback(() => {
    if (flow.status !== 'record.recording' || pendingFinalizeRef.current) return;
    const id = operationId('stop-recording');
    const baseRevision = flow.projectRevision;
    finalizedOperationRef.current = null;
    send({ type: 'recording-stop-requested', operationId: id });
    pendingFinalizeRef.current = { id, baseRevision };
    void recording.stop();
  }, [flow.projectRevision, flow.status, recording, send]);
  automaticRecordingStopRef.current = finishRecording;

  const pendingFinalizeOperation =
    flow.status === 'record.finalizing' && flow.pending?.kind === 'stop-recording'
      ? flow.pending
      : null;

  useEffect(() => {
    if (flow.status === 'record.recording' && recording.elapsedSeconds >= RECORDING_LIMIT_SECONDS) {
      finishRecording();
    }
  }, [finishRecording, flow.status, recording.elapsedSeconds]);

  useEffect(() => {
    const pending = pendingFinalizeOperation;
    const artifact = recording.original;
    if (
      !pending ||
      !artifact ||
      recording.lifecycle !== 'recorded' ||
      finalizedOperationRef.current === pending.id
    )
      return;
    finalizedOperationRef.current = pending.id;
    pendingFinalizeRef.current = null;
    connectedAtRef.current = null;
    session.stopCamera();
    const audioId = recording.sidecar.blob ? `original-audio:${artifact.id}` : null;
    const data: GuidedProjectDataV1 = {
      ...flow.data,
      originalVideoArtifactId: artifact.id,
      originalVideoMetadata: {
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        sourceModeId: artifact.sourceModeId,
        startedAt: artifact.startedAt,
        durationMs: artifact.durationMs,
        sizeBytes: artifact.sizeBytes,
      },
      originalAudioArtifactId: audioId,
      originalAudioMimeType: recording.sidecar.mimeType,
      processedVideoArtifactId: null,
      processedVideoMetadata: null,
      finalVariant: null,
      selectedVoiceId: null,
      selectedVoiceName: null,
    };
    const artifacts: ProjectArtifactCommit[] = [
      {
        id: artifact.id,
        kind: 'original-video',
        blob: artifact.media,
        mimeType: artifact.mimeType,
      },
      ...(audioId && recording.sidecar.blob
        ? [
            {
              id: audioId,
              kind: 'original-audio' as const,
              blob: recording.sidecar.blob,
              ...(recording.sidecar.mimeType ? { mimeType: recording.sidecar.mimeType } : {}),
            },
          ]
        : []),
    ];
    void commitProject('review-take', data, pending.baseRevision, artifacts)
      .then((record) => {
        send({
          type: 'recording-finalized',
          operationId: pending.id,
          baseRevision: pending.baseRevision,
          nextRevision: record.revision,
          data,
        });
      })
      .catch((caught: unknown) => {
        setStorage(repository.getStorageState());
        send({
          type: 'recording-checkpoint-failed',
          operationId: pending.id,
          baseRevision: pending.baseRevision,
          message: friendlyError(
            caught,
            'The take is safe in this tab but still needs to be saved.',
          ),
          data,
        });
      });
  }, [commitProject, flow.data, pendingFinalizeOperation, recording, repository, send, session]);

  useEffect(() => {
    const pending = pendingFinalizeOperation;
    if (!pending || recording.lifecycle !== 'error' || finalizedOperationRef.current === pending.id)
      return;
    finalizedOperationRef.current = pending.id;
    pendingFinalizeRef.current = null;
    connectedAtRef.current = null;
    session.stopCamera();
    failOperation(
      pending.id,
      pending.baseRevision,
      recording.recordingError ??
        'The recording could not be finalized. Start the camera to retry.',
    );
  }, [
    failOperation,
    pendingFinalizeOperation,
    recording.lifecycle,
    recording.recordingError,
    session,
  ]);

  const acceptTake = async () => {
    const id = operationId('accept-take');
    const baseRevision = flow.projectRevision;
    send({ type: 'take-accepted', operationId: id });
    try {
      void requestPersistentProjectStorage();
      const original = recording.original;
      if (!original || !flow.data.originalVideoArtifactId) {
        throw new Error('The immutable original take is unavailable.');
      }
      const [storedVideo, storedAudio] = await Promise.all([
        repository.readArtifact(projectIdRef.current, flow.data.originalVideoArtifactId),
        flow.data.originalAudioArtifactId
          ? repository.readArtifact(projectIdRef.current, flow.data.originalAudioArtifactId)
          : Promise.resolve(null),
      ]);
      const missingArtifacts: ProjectArtifactCommit[] = [
        ...(!storedVideo
          ? [
              {
                id: flow.data.originalVideoArtifactId,
                kind: 'original-video' as const,
                blob: original.media,
                mimeType: original.mimeType,
              },
            ]
          : []),
        ...(!storedAudio && flow.data.originalAudioArtifactId && recording.sidecar.blob
          ? [
              {
                id: flow.data.originalAudioArtifactId,
                kind: 'original-audio' as const,
                blob: recording.sidecar.blob,
                ...(recording.sidecar.mimeType ? { mimeType: recording.sidecar.mimeType } : {}),
              },
            ]
          : []),
      ];
      const record = await commitProject(
        'accepted-take',
        flow.data,
        baseRevision,
        missingArtifacts,
      );
      await session.releaseForRecordedReview();
      send({
        type: 'take-checkpointed',
        operationId: id,
        baseRevision,
        nextRevision: record.revision,
      });
    } catch (caught) {
      failOperation(
        id,
        baseRevision,
        friendlyError(caught, 'The accepted take could not be saved.'),
      );
    }
  };

  const reRecord = () => {
    processing.restoreOriginal();
    send({ type: 're-record-requested' });
  };

  const pendingVoiceRef = useRef<{ id: string; baseRevision: number } | null>(null);
  const voiceCheckpointOperationRef = useRef<string | null>(null);
  const applyVoiceById = (voiceId: string, voiceName: string) => {
    if (pendingVoiceRef.current) return;
    const id = operationId('process-voice');
    const baseRevision = flow.projectRevision;
    voiceCheckpointOperationRef.current = null;
    pendingVoiceRef.current = { id, baseRevision };
    send({ type: 'voice-selected', voiceId, voiceName });
    send({ type: 'voice-apply-requested', operationId: id });
    void processing.applyElevenLabs(voiceId, voiceName);
  };
  const applyVoice = (voice: VoiceSummary) => applyVoiceById(voice.voiceId, voice.name);
  const cancelVoiceProcessing = () => {
    pendingVoiceRef.current = null;
    voiceCheckpointOperationRef.current = null;
    processing.cancel();
    send({ type: 'voice-processing-cancelled' });
  };

  const pendingVoiceOperation =
    flow.status === 'voice.processing' && flow.pending?.kind === 'process-voice'
      ? flow.pending
      : null;
  useEffect(() => {
    const pending = pendingVoiceOperation;
    if (!pending) return;
    if (recording.processingState === 'ready' && recording.processed) {
      if (voiceCheckpointOperationRef.current === pending.id) return;
      voiceCheckpointOperationRef.current = pending.id;
      pendingVoiceRef.current = null;
      setVoicePreviewVariant('processed');
      const artifact = recording.processed;
      const data: GuidedProjectDataV1 = {
        ...flow.data,
        processedVideoArtifactId: artifact.id,
        processedVideoMetadata: {
          filename: artifact.filename,
          mimeType: artifact.mimeType,
          sourceModeId: artifact.sourceModeId,
          startedAt: artifact.startedAt,
          durationMs: artifact.durationMs,
          sizeBytes: artifact.sizeBytes,
        },
        finalVariant: null,
      };
      const remove = flow.data.processedVideoArtifactId ? [flow.data.processedVideoArtifactId] : [];
      void commitProject(
        'processed-voice',
        data,
        pending.baseRevision,
        [
          {
            id: artifact.id,
            kind: 'processed-video',
            blob: artifact.media,
            mimeType: artifact.mimeType,
            sourceArtifactId: flow.data.originalVideoArtifactId,
          },
        ],
        remove,
      )
        .then((record) =>
          send({
            type: 'voice-processed',
            operationId: pending.id,
            baseRevision: pending.baseRevision,
            nextRevision: record.revision,
            data,
          }),
        )
        .catch((caught: unknown) =>
          failOperation(
            pending.id,
            pending.baseRevision,
            friendlyError(caught, 'The processed voice is safe in memory but could not be stored.'),
          ),
        );
    } else if (recording.processingState === 'error') {
      if (voiceCheckpointOperationRef.current === pending.id) return;
      voiceCheckpointOperationRef.current = pending.id;
      pendingVoiceRef.current = null;
      failOperation(
        pending.id,
        pending.baseRevision,
        recording.processingError ?? 'Voice processing failed. The original is preserved.',
      );
    }
  }, [
    commitProject,
    failOperation,
    flow.data,
    pendingVoiceOperation,
    recording.processed,
    recording.processingError,
    recording.processingState,
    send,
  ]);

  const prepareDelivery = async (variant: 'original' | 'processed') => {
    const kind = variant === 'processed' ? 'accept-processed-voice' : 'keep-original';
    const id = operationId(kind);
    const baseRevision = flow.projectRevision;
    if (variant === 'original') {
      processing.restoreOriginal();
      send({ type: 'keep-original-requested', operationId: id });
    } else {
      send({ type: 'processed-voice-accepted', operationId: id });
    }
    const data: GuidedProjectDataV1 = {
      ...flow.data,
      finalVariant: variant,
      ...(variant === 'original' ? { selectedVoiceId: null, selectedVoiceName: null } : {}),
    };
    try {
      const record = await commitProject('delivery-ready', data, baseRevision);
      send({
        type: 'voice-checkpointed',
        operationId: id,
        baseRevision,
        nextRevision: record.revision,
        data,
      });
      const prepareId = operationId('prepare-delivery');
      send({ type: 'delivery-prepare-requested', operationId: prepareId });
      send({
        type: 'delivery-ready',
        operationId: prepareId,
        baseRevision: record.revision,
      });
    } catch (caught) {
      failOperation(id, baseRevision, friendlyError(caught, 'The final video could not be saved.'));
    }
  };

  const dispatchDownload = async () => {
    const artifact = recording.presented;
    if (!artifact) return;
    const id = operationId('dispatch-download');
    const baseRevision = flow.projectRevision;
    send({ type: 'download-requested', operationId: id });
    const startedAt = new Date().toISOString();
    let browserDownloadStarted = false;
    try {
      const anchor = document.createElement('a');
      anchor.href = artifact.objectUrl;
      anchor.download = readableFilename(
        flow.data.characterName,
        flow.data.finalVariant === 'processed' ? flow.data.selectedVoiceName : null,
        artifact.mimeType,
      );
      anchor.click();
      browserDownloadStarted = true;
      recording.markDownloaded();
      setDownloadStarted(true);
      const dispatchedData: GuidedProjectDataV1 = {
        ...flow.data,
        downloadStartedAt: startedAt,
      };
      const dispatched = await commitProject('delivery-ready', dispatchedData, baseRevision);
      telemetry.track({
        type: 'guided-download-dispatched',
        artifact: flow.data.finalVariant === 'processed' ? 'processed' : 'original',
        projectRevision: dispatched.revision,
        timestamp: startedAt,
      });
      send({
        type: 'download-dispatched',
        operationId: id,
        baseRevision,
        nextRevision: dispatched.revision,
        data: dispatchedData,
      });
      const completedId = `${id}:complete`;
      const completedAt = new Date().toISOString();
      const completeData: GuidedProjectDataV1 = { ...dispatchedData, completedAt };
      try {
        const completed = await commitProject('complete', completeData, dispatched.revision);
        send({
          type: 'completion-checkpointed',
          operationId: completedId,
          baseRevision: dispatched.revision,
          nextRevision: completed.revision,
          data: completeData,
        });
      } catch (caught) {
        failOperation(
          completedId,
          dispatched.revision,
          friendlyError(
            caught,
            'The download started, but the local completion checkpoint needs a retry.',
          ),
        );
        return;
      }
      processing.cancel();
      session.stopCamera();
      recording.discard();
    } catch (caught) {
      failOperation(
        id,
        baseRevision,
        friendlyError(
          caught,
          browserDownloadStarted
            ? 'The download started, but the local completion checkpoint needs a retry.'
            : 'The browser could not start the download.',
        ),
      );
    }
  };

  const downloadSavedAgain = async () => {
    const artifactId =
      flow.data.finalVariant === 'processed' && flow.data.processedVideoArtifactId
        ? flow.data.processedVideoArtifactId
        : flow.data.originalVideoArtifactId;
    if (!artifactId) return;
    try {
      const blob = await repository.readArtifact(projectIdRef.current, artifactId);
      if (!blob) throw new Error('The locally saved video bytes are unavailable.');
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = readableFilename(
        flow.data.characterName,
        flow.data.finalVariant === 'processed' ? flow.data.selectedVoiceName : null,
        blob.type,
      );
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setDownloadStarted(true);
    } catch (caught) {
      setFlow((current) => ({
        ...current,
        error: friendlyError(caught, 'The saved video could not be downloaded again.'),
      }));
    }
  };

  const retryStorage = () => {
    setStorageDismissed(false);
    void repository
      .retryDurableStorage()
      .then(setStorage)
      .catch(() => setStorage(repository.getStorageState()));
  };

  const { presentation: stagePresentation, notices: stageNotices } = useGuidedStageMedia(
    flow.status,
    recording,
    session,
  );

  if (projectsOnly) return <GuidedProjectBrowser repository={repository} storage={storage} />;

  const voiceHasAudio = recording.sidecar.state === 'ready' && Boolean(recording.sidecar.blob);

  if (restoring) {
    return (
      <div css={guidedPageStyles(theme)}>
        <main css={[guidedShellStyles(theme), { placeItems: 'center' }]}>
          <StatusNotice role="status">Restoring your private browser-local project…</StatusNotice>
        </main>
      </div>
    );
  }

  const currentStage = stageForStatus(flow.status);
  return (
    <div css={guidedPageStyles(theme)}>
      <a
        href="#guided-main"
        css={{
          position: 'fixed',
          inset: '-10rem auto auto 1rem',
          ':focus': { insetBlockStart: '1rem' },
        }}
      >
        Skip to current step
      </a>
      <div css={guidedShellStyles(theme)}>
        <GuidedProgressHeader flow={flow} />
        <GuidedStorageRecovery
          storage={storage}
          original={recording.original}
          dismissed={storageDismissed}
          onRetry={retryStorage}
          onContinue={() => setStorageDismissed(true)}
        />
        <main id="guided-main" tabIndex={-1} css={contentCardStyles(theme)}>
          {currentStage === 'create' ? (
            <GuidedCreateStage
              flow={flow}
              storage={storage}
              draft={draft}
              design={design}
              builderError={builderError}
              referencePreviewUrl={referencePreviewUrl}
              preparingCharacterSave={preparingCharacterSave}
              referenceImagesAvailable={Boolean(availability.referenceImages)}
              referenceImageOptimizerAvailable={Boolean(
                availability.referenceImageOptimizerAvailable,
              )}
              onBuilderChange={handleBuilderChange}
              onRequestSaveCharacter={() => void requestSaveCharacter()}
              onReferenceChoiceCancel={() => send({ type: 'reference-choice-cancelled' })}
              onPromptOnly={choosePromptOnly}
              onGenerateSelected={() => {
                const id = operationId('save-character-with-reference');
                send({ type: 'reference-mode-selected', mode: 'generate', operationId: id });
              }}
              onKeepExisting={() => void chooseExistingReference()}
              onReferenceSettingsCancel={() =>
                setFlow((current) => ({
                  ...current,
                  status: 'create.reference-choice',
                  error: null,
                }))
              }
              onGenerated={handleGeneratedReference}
            />
          ) : null}
          {currentStage === 'live' ? (
            <GuidedLiveStage
              storage={storage}
              status={flow.status}
              characterName={flow.data.characterName}
              referenceImageUrl={referencePreviewUrl}
              presentation={stagePresentation}
              lifecycle={session.lifecycle}
              liveSeconds={session.liveSeconds}
              generationSeconds={session.generationSeconds}
              notices={stageNotices}
              mediaSupported={browser.mediaDevices && browser.secureContext}
              cameraReady={cameraReady}
              microphoneReady={microphoneReady}
              aiAvailable={Boolean(availability.decart)}
              aiConnected={session.transformedVideoUsable}
              capabilityState={capabilityState}
              aiStartQueued={aiStartQueued}
              error={flow.error}
              permissionPrimer={permissionPrimer}
              onRetryCapabilities={retryCapabilities}
              onConfirmCameraStart={confirmCameraStart}
              onCancelPermissionPrimer={cancelCameraStart}
              onContinueToRecord={continueToRecord}
              onRequestCameraStart={requestCameraStart}
              onStartAi={startAi}
              onStopAi={stopAi}
              onStopCamera={stopCamera}
              onEditCharacter={() => {
                stopCamera();
                setFlow((current) => ({ ...current, status: 'create.editing' }));
              }}
            />
          ) : null}
          {currentStage === 'record' ? (
            <GuidedRecordStage
              storage={storage}
              status={flow.status}
              presentation={stagePresentation}
              lifecycle={session.lifecycle}
              liveSeconds={session.liveSeconds}
              generationSeconds={session.generationSeconds}
              notices={stageNotices}
              recordingSeconds={recording.elapsedSeconds}
              countdownValue={countdownValue}
              refreshingForRecord={refreshingForRecord}
              error={flow.error}
              sidecar={recording.sidecar}
              original={recording.original}
              recordingSourceAvailable={Boolean(recordingSource)}
              transformedVideoUsable={session.transformedVideoUsable}
              onUseTake={() => void acceptTake()}
              onReRecord={reRecord}
              onStopRecording={finishRecording}
              onStartRecording={beginCountdown}
              onPracticeAgain={() =>
                setFlow((current) => ({ ...current, status: 'live.connected' }))
              }
              onStopAi={flow.status === 'record.recording' ? finishRecording : stopAi}
              onStopCamera={flow.status === 'record.recording' ? finishRecording : stopCamera}
            />
          ) : null}
          {currentStage === 'voice' ? (
            <GuidedVoiceStage
              storage={storage}
              status={flow.status}
              selectedVoiceName={flow.data.selectedVoiceName}
              previewVariant={voicePreviewVariant}
              hasAudio={voiceHasAudio}
              elevenLabsAvailable={Boolean(availability.elevenLabs)}
              voiceLibraryLoaded={voiceLibraryLoaded}
              processingState={recording.processingState}
              original={recording.original}
              processed={recording.processed}
              presented={recording.presented}
              error={flow.error}
              onPreviewVariantChange={setVoicePreviewVariant}
              onUseProcessedVoice={() => void prepareDelivery('processed')}
              onChooseAnotherVoice={() => send({ type: 'choose-another-voice' })}
              onKeepOriginal={() => void prepareDelivery('original')}
              onCancelProcessing={cancelVoiceProcessing}
              onLoadVoiceLibrary={() => setVoiceLibraryLoaded(true)}
              onApplyVoice={applyVoice}
              onRetrySelectedVoice={() => {
                if (flow.data.selectedVoiceId && flow.data.selectedVoiceName) {
                  applyVoiceById(flow.data.selectedVoiceId, flow.data.selectedVoiceName);
                }
              }}
            />
          ) : null}
          {currentStage === 'download' ? (
            <GuidedDownloadStage
              storage={storage}
              status={flow.status}
              artifact={recording.presented}
              videoHeight={recording.metadata?.height}
              selectedVoiceName={flow.data.selectedVoiceName}
              characterName={flow.data.characterName}
              error={flow.error}
              downloadStarted={downloadStarted}
              onCreateAnother={() => window.location.assign('/?new=1')}
              onDownloadAgain={() => void downloadSavedAgain()}
              onDownload={() => void dispatchDownload()}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
};
