import {
  beginVoiceProcessing,
  completeVoiceProcessing,
  createSafeError,
  createVoiceProcessingState,
  failVoiceProcessing,
  restoreOriginalVoice,
  type VoiceEffectSelection as DomainVoiceEffectSelection,
  type VoiceProcessingState as DomainVoiceProcessingState,
} from '@studio/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { convertRecordingVoice } from '../../adapters/api-client/voicesApi';
import { decodeAudioBlob, renderLocalEffect } from '../../adapters/media-processing/audioEffects';
import { replaceRecordingAudio } from '../../adapters/media-processing/replaceAudioTrack';
import { transcodeRecordingToMp4 } from '../../adapters/media-processing/transcodeRecording';
import type { RecordingArtifact, RecordingController } from '../../features/recording/types';
import type {
  LocalVoiceEffectId,
  VoiceEffectSelection,
  VoiceProcessingController,
  VoiceProcessingOutcome,
} from '../../features/voice-effects/types';

const safeProcessingMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === 'AbortError')
    return 'Voice processing was canceled.';
  if (error instanceof Error && error.message) return error.message;
  return 'Voice processing could not be completed. The previous take is still available.';
};

export const useVoiceProcessing = (recording: RecordingController): VoiceProcessingController => {
  const [selectionState, setSelectionState] = useState<{
    original: RecordingArtifact | null;
    selection: VoiceEffectSelection;
  }>(() => ({ original: recording.original, selection: { kind: 'none' } }));
  if (selectionState.original !== recording.original) {
    setSelectionState({ original: recording.original, selection: { kind: 'none' } });
  }
  const selection =
    selectionState.original === recording.original
      ? selectionState.selection
      : ({ kind: 'none' } as const);
  const abortRef = useRef<AbortController | null>(null);
  const recordingRef = useRef(recording);
  const domainStateRef = useRef<DomainVoiceProcessingState<RecordingArtifact> | null>(null);
  const operationCounterRef = useRef(0);

  const setSelection = useCallback((nextSelection: VoiceEffectSelection) => {
    setSelectionState({
      original: recordingRef.current.original,
      selection: nextSelection,
    });
  }, []);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    recordingRef.current.cancelProcessing();
  }, []);

  const prepare = useCallback(
    (domainSelection: DomainVoiceEffectSelection, explicitVideo?: RecordingArtifact) => {
      cancel();
      const current = recordingRef.current;
      if (!current.original || !current.sidecar.blob) {
        throw new Error('A completed recording with audio is required.');
      }
      const operationId = `voice-${++operationCounterRef.current}`;
      const domainState =
        domainStateRef.current?.original === current.original
          ? domainStateRef.current
          : createVoiceProcessingState(current.original);
      domainStateRef.current = beginVoiceProcessing(domainState, domainSelection, operationId);
      const controller = new AbortController();
      abortRef.current = controller;
      const voiceName = domainSelection.kind === 'elevenlabs' ? domainSelection.voiceName : null;
      current.beginProcessing({
        kind: 'voice-conversion',
        title: voiceName ? `Applying ${voiceName}…` : 'Rendering voice treatment…',
        detail: 'The immutable original audio is being prepared for this video.',
      });
      const videoArtifact = explicitVideo ?? current.visual ?? current.original;
      return {
        controller,
        operationId,
        videoArtifact,
        video: videoArtifact.media,
        sidecar: current.sidecar.blob,
      };
    },
    [cancel],
  );

  const completeDomainOperation = useCallback(
    (operationId: string, artifact: RecordingArtifact, nextSelection: VoiceEffectSelection) => {
      const current = domainStateRef.current;
      if (!current) return;
      const completed = completeVoiceProcessing(current, operationId, artifact);
      domainStateRef.current = completed;
      if (completed.status === 'ready') setSelection(nextSelection);
    },
    [setSelection],
  );

  const failDomainOperation = useCallback((operationId: string, message: string) => {
    const current = domainStateRef.current;
    if (!current) return;
    domainStateRef.current = failVoiceProcessing(
      current,
      operationId,
      createSafeError('voice-processing-failure', message, { retryable: true }),
    );
  }, []);

  const applyLocalTo = useCallback(
    async (
      videoArtifact: RecordingArtifact,
      effect: LocalVoiceEffectId,
      options?: { readonly replaceExistingResult?: boolean },
    ): Promise<VoiceProcessingOutcome> => {
      let controller: AbortController | null = null;
      let operationId: string | null = null;
      try {
        const prepared = prepare({ kind: 'local', effectId: effect }, videoArtifact);
        controller = prepared.controller;
        operationId = prepared.operationId;
        const { video, sidecar } = prepared;
        const decoded = await decodeAudioBlob(sidecar);
        const rendered = await renderLocalEffect(decoded, effect, controller.signal);
        const result = await replaceRecordingAudio(video, rendered, controller.signal);
        recordingRef.current.beginProcessing({
          kind: 'transcoding',
          title: 'Transcoding voice result…',
          detail: 'Normalizing the completed video to H.264/AAC MP4.',
        });
        const normalized = await transcodeRecordingToMp4(result.blob, {
          requireAudio: true,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        if (abortRef.current !== controller) return { status: 'canceled' };
        const artifact = recordingRef.current.completeProcessing(
          normalized.blob,
          normalized.mimeType,
          effect,
          prepared.videoArtifact,
          options?.replaceExistingResult,
        );
        completeDomainOperation(operationId, artifact, { kind: 'local', effect });
        return { status: 'ready', artifact };
      } catch (error) {
        if (controller && abortRef.current !== controller) return { status: 'canceled' };
        if (error instanceof DOMException && error.name === 'AbortError') {
          recordingRef.current.cancelProcessing();
          return { status: 'canceled' };
        }
        const message = safeProcessingMessage(error);
        if (operationId) failDomainOperation(operationId, message);
        recordingRef.current.failProcessing(message);
        return { status: 'error', message };
      } finally {
        if (controller && abortRef.current === controller) abortRef.current = null;
      }
    },
    [completeDomainOperation, failDomainOperation, prepare],
  );

  const applyLocal = useCallback(
    async (effect: LocalVoiceEffectId) => {
      const current = recordingRef.current;
      const videoArtifact = current.visual ?? current.original;
      if (!videoArtifact) {
        current.failProcessing('A completed recording is required.');
        return;
      }
      await applyLocalTo(videoArtifact, effect);
    },
    [applyLocalTo],
  );

  const applyElevenLabsTo = useCallback(
    async (
      videoArtifact: RecordingArtifact,
      voiceId: string,
      voiceName: string,
      options?: { readonly replaceExistingResult?: boolean },
    ): Promise<VoiceProcessingOutcome> => {
      let controller: AbortController | null = null;
      let operationId: string | null = null;
      try {
        const prepared = prepare({ kind: 'elevenlabs', voiceId, voiceName }, videoArtifact);
        controller = prepared.controller;
        operationId = prepared.operationId;
        const { video, sidecar } = prepared;
        const converted = await convertRecordingVoice(voiceId, sidecar, controller.signal);
        recordingRef.current.beginProcessing({
          kind: 'voice-composition',
          title: `Composing ${voiceName}…`,
          detail: 'Combining the converted voice with the selected video.',
        });
        const result = await replaceRecordingAudio(video, converted, controller.signal);
        recordingRef.current.beginProcessing({
          kind: 'transcoding',
          title: 'Transcoding voice result…',
          detail: 'Normalizing the completed video to H.264/AAC MP4.',
        });
        const normalized = await transcodeRecordingToMp4(result.blob, {
          requireAudio: true,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        if (abortRef.current !== controller) return { status: 'canceled' };
        const artifact = recordingRef.current.completeProcessing(
          normalized.blob,
          normalized.mimeType,
          `voice-${voiceName}`,
          videoArtifact,
          options?.replaceExistingResult,
        );
        completeDomainOperation(operationId, artifact, {
          kind: 'elevenlabs',
          voiceId,
          voiceName,
        });
        return { status: 'ready', artifact };
      } catch (error) {
        if (controller && abortRef.current !== controller) return { status: 'canceled' };
        if (error instanceof DOMException && error.name === 'AbortError') {
          recordingRef.current.cancelProcessing();
          return { status: 'canceled' };
        }
        const message = safeProcessingMessage(error);
        if (operationId) failDomainOperation(operationId, message);
        recordingRef.current.failProcessing(message);
        return { status: 'error', message };
      } finally {
        if (controller && abortRef.current === controller) abortRef.current = null;
      }
    },
    [completeDomainOperation, failDomainOperation, prepare],
  );

  const applyElevenLabs = useCallback(
    async (voiceId: string, voiceName: string) => {
      const current = recordingRef.current;
      const videoArtifact = current.visual ?? current.original;
      if (!videoArtifact) {
        current.failProcessing('A completed recording is required.');
        return;
      }
      await applyElevenLabsTo(videoArtifact, voiceId, voiceName);
    },
    [applyElevenLabsTo],
  );

  const restoreOriginal = useCallback(() => {
    cancel();
    recordingRef.current.restoreOriginal();
    if (domainStateRef.current) {
      domainStateRef.current = restoreOriginalVoice(domainStateRef.current);
    }
    setSelection({ kind: 'none' });
  }, [cancel, setSelection]);

  useEffect(() => {
    domainStateRef.current = recording.original
      ? createVoiceProcessingState(recording.original)
      : null;
  }, [recording.original]);

  useEffect(() => cancel, [cancel]);

  return {
    selection,
    applyLocal,
    applyLocalTo,
    applyElevenLabs,
    applyElevenLabsTo,
    restoreOriginal,
    cancel,
  };
};
