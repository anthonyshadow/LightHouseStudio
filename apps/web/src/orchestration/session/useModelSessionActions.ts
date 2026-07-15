import { canApplyRealtimeChanges } from '@studio/domain';
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { requestRealtimeToken } from '../../adapters/api-client/apiClient';
import { getDecartModelRequirements } from '../../adapters/decart-realtime/DecartRealtimeGateway';
import { hasLiveVideo } from '../../adapters/browser-media/browserMedia';
import {
  isModelMode,
  toSafeMediaError,
  type AppliedRealtimeState,
  type SafeMediaError,
  type SessionDraft,
  type SessionLifecycle,
} from '../../features/media-session';
import { toAppliedState, toProviderSnapshot, validateModelDraft } from './realtimeSnapshot';
import { useRealtimeResource, type RealtimeDisconnectReason } from './useRealtimeResource';

export type ModelSessionActionsOptions = {
  decartAvailable: boolean;
  operationRef: RefObject<number>;
  startAbortRef: RefObject<AbortController | null>;
  draftRef: RefObject<SessionDraft>;
  lifecycle: SessionLifecycle;
  setLifecycle: Dispatch<SetStateAction<SessionLifecycle>>;
  setApplied: Dispatch<SetStateAction<AppliedRealtimeState | null>>;
  applying: boolean;
  setApplying: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<SafeMediaError | null>>;
  ensureMedia(
    requirements: {
      width: number;
      height: number;
      frameRate: number;
    },
    operation: number,
  ): Promise<MediaStream>;
  localRef: RefObject<MediaStream | null>;
  startLiveTimer(): void;
  onPromptCommitted?: (mode: 'lucy-2.5' | 'lucy-vton-3', prompt: string) => void;
};

export type ModelSessionActions = {
  remoteStream: MediaStream | null;
  generationSeconds: number;
  disconnectRealtime(): void;
  startModel(): Promise<void>;
  applyChanges(): Promise<void>;
};

const disconnectError = (reason: RealtimeDisconnectReason): SafeMediaError =>
  reason === 'remote-ended'
    ? {
        code: 'remote-ended',
        message: 'The transformed video ended. Local preview is still available.',
        recovery: 'Reconnect AI, continue locally, or stop the camera.',
      }
    : {
        code: 'provider-disconnected',
        message: 'The AI connection ended. Local preview is still available.',
        recovery: 'Reconnect AI, continue locally, or stop the camera.',
      };

export const useModelSessionActions = ({
  decartAvailable,
  operationRef,
  startAbortRef,
  draftRef,
  lifecycle,
  setLifecycle,
  setApplied,
  applying,
  setApplying,
  setError,
  ensureMedia,
  localRef,
  startLiveTimer,
  onPromptCommitted,
}: ModelSessionActionsOptions): ModelSessionActions => {
  const handleDisconnected = useCallback(
    (reason: RealtimeDisconnectReason) => {
      setApplied(null);
      setApplying(false);
      setLifecycle('disconnected');
      setError(disconnectError(reason));
    },
    [setApplied, setApplying, setError, setLifecycle],
  );

  const handleProviderError = useCallback(() => {
    setError({
      code: 'realtime-provider-error',
      message: 'Realtime transformation encountered a provider error.',
      recovery: 'Keep the local preview, then retry or reset the AI session.',
    });
  }, [setError]);

  const realtime = useRealtimeResource({
    operationRef,
    onConnectionChange: setLifecycle,
    onDisconnected: handleDisconnected,
    onProviderError: handleProviderError,
  });

  const startModel = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (!isModelMode(currentDraft.mode)) return;

    const validation = validateModelDraft(currentDraft);
    if (validation) {
      setError({ code: 'model-input-required', message: validation });
      setLifecycle('error');
      return;
    }
    if (!decartAvailable) {
      setError({
        code: 'decart-unavailable',
        message: 'Realtime AI is not configured on this server.',
        recovery: 'Add the server-only Decart key or continue with Local Camera.',
      });
      setLifecycle('error');
      return;
    }

    const operation = ++operationRef.current;
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    setError(null);
    realtime.disconnect();

    try {
      const requirements = await getDecartModelRequirements(currentDraft.mode);
      if (operationRef.current !== operation) return;
      setLifecycle('requesting-media');
      const stream = await ensureMedia(requirements, operation);
      if (operationRef.current !== operation) return;
      startLiveTimer();

      setLifecycle('requesting-token');
      const controller = new AbortController();
      startAbortRef.current = controller;
      const token = await requestRealtimeToken(currentDraft.mode, controller.signal);
      if (operationRef.current !== operation) return;

      setLifecycle('connecting');
      const connected = await realtime.connect({
        operation,
        apiKey: token.apiKey,
        model: currentDraft.mode,
        localStream: stream,
        initial: toProviderSnapshot(currentDraft.mode, currentDraft),
        signal: controller.signal,
      });
      if (!connected) return;

      if (startAbortRef.current === controller) startAbortRef.current = null;
      setApplied(toAppliedState(currentDraft));
      setLifecycle((value) => (value === 'connecting' ? 'connected' : value));
      const committedPrompt = currentDraft.prompt.trim();
      if (committedPrompt) onPromptCommitted?.(currentDraft.mode, committedPrompt);
    } catch (caught) {
      if (operationRef.current === operation) startAbortRef.current = null;
      if (operationRef.current !== operation) return;
      realtime.disconnect();
      setLifecycle(hasLiveVideo(localRef.current) ? 'ready' : 'error');
      setError(
        toSafeMediaError(
          caught,
          'Realtime transformation could not be started. Local preview is safe.',
        ),
      );
    }
  }, [
    decartAvailable,
    draftRef,
    ensureMedia,
    localRef,
    onPromptCommitted,
    operationRef,
    realtime,
    setApplied,
    setError,
    setLifecycle,
    startAbortRef,
    startLiveTimer,
  ]);

  const applyChanges = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (
      !isModelMode(currentDraft.mode) ||
      !realtime.hasSession() ||
      !canApplyRealtimeChanges({
        activeModeId: currentDraft.mode,
        status: lifecycle,
        isApplying: applying,
      })
    ) {
      return;
    }
    const validation = validateModelDraft(currentDraft);
    if (validation) {
      setError({ code: 'model-input-required', message: validation });
      return;
    }

    const operation = operationRef.current;
    setApplying(true);
    setError(null);
    try {
      await realtime.apply(toProviderSnapshot(currentDraft.mode, currentDraft));
      if (operationRef.current !== operation) return;
      setApplied(toAppliedState(currentDraft));
      const committedPrompt = currentDraft.prompt.trim();
      if (committedPrompt) onPromptCommitted?.(currentDraft.mode, committedPrompt);
    } catch {
      if (operationRef.current !== operation) return;
      setError({
        code: 'apply-failed',
        message: 'Changes were not applied. The previous live recipe is still active.',
        recovery: 'Review the pending draft and try Apply again.',
      });
    } finally {
      if (operationRef.current === operation) setApplying(false);
    }
  }, [
    applying,
    draftRef,
    lifecycle,
    onPromptCommitted,
    operationRef,
    realtime,
    setApplied,
    setApplying,
    setError,
  ]);

  return {
    remoteStream: realtime.remoteStream,
    generationSeconds: realtime.generationSeconds,
    disconnectRealtime: realtime.disconnect,
    startModel,
    applyChanges,
  };
};
