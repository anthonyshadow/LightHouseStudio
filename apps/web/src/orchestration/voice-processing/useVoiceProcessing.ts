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
import type { RecordingArtifact, RecordingController } from '../../features/recording/types';
import type {
  LocalVoiceEffectId,
  VoiceEffectSelection,
  VoiceProcessingController,
} from '../../features/voice-effects/types';

export type { VoiceProcessingController } from '../../features/voice-effects/types';

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
    (domainSelection: DomainVoiceEffectSelection) => {
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
      current.beginProcessing();
      return {
        controller,
        operationId,
        video: current.original.media,
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

  const applyLocal = useCallback(
    async (effect: LocalVoiceEffectId) => {
      let controller: AbortController | null = null;
      let operationId: string | null = null;
      try {
        const prepared = prepare({ kind: 'local', effectId: effect });
        controller = prepared.controller;
        operationId = prepared.operationId;
        const { video, sidecar } = prepared;
        const decoded = await decodeAudioBlob(sidecar);
        const rendered = await renderLocalEffect(decoded, effect, controller.signal);
        const result = await replaceRecordingAudio(video, rendered, controller.signal);
        controller.signal.throwIfAborted();
        if (abortRef.current !== controller) return;
        const artifact = recordingRef.current.completeProcessing(
          result.blob,
          result.mimeType,
          effect,
        );
        completeDomainOperation(operationId, artifact, { kind: 'local', effect });
      } catch (error) {
        if (controller && abortRef.current !== controller) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          recordingRef.current.cancelProcessing();
          return;
        }
        const message = safeProcessingMessage(error);
        if (operationId) failDomainOperation(operationId, message);
        recordingRef.current.failProcessing(message);
      } finally {
        if (controller && abortRef.current === controller) abortRef.current = null;
      }
    },
    [completeDomainOperation, failDomainOperation, prepare],
  );

  const applyElevenLabs = useCallback(
    async (voiceId: string, voiceName: string) => {
      let controller: AbortController | null = null;
      let operationId: string | null = null;
      try {
        const prepared = prepare({ kind: 'elevenlabs', voiceId, voiceName });
        controller = prepared.controller;
        operationId = prepared.operationId;
        const { video, sidecar } = prepared;
        const converted = await convertRecordingVoice(voiceId, sidecar, controller.signal);
        const result = await replaceRecordingAudio(video, converted, controller.signal);
        controller.signal.throwIfAborted();
        if (abortRef.current !== controller) return;
        const artifact = recordingRef.current.completeProcessing(
          result.blob,
          result.mimeType,
          'voice',
        );
        completeDomainOperation(operationId, artifact, {
          kind: 'elevenlabs',
          voiceId,
          voiceName,
        });
      } catch (error) {
        if (controller && abortRef.current !== controller) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          recordingRef.current.cancelProcessing();
          return;
        }
        const message = safeProcessingMessage(error);
        if (operationId) failDomainOperation(operationId, message);
        recordingRef.current.failProcessing(message);
      } finally {
        if (controller && abortRef.current === controller) abortRef.current = null;
      }
    },
    [completeDomainOperation, failDomainOperation, prepare],
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

  return { selection, applyLocal, applyElevenLabs, restoreOriginal, cancel };
};
