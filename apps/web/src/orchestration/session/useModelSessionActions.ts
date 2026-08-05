import { canApplyRealtimeChanges } from '@studio/domain';
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { ApiClientError, requestRealtimeToken } from '../../adapters/api-client/apiClient';
import {
  DecartRealtimeGatewayError,
  getDecartModelRequirements,
} from '../../adapters/decart-realtime/DecartRealtimeGateway';
import { hasLiveVideo } from '../../adapters/browser-media/browserMedia';
import type { ModelMode, PromptCommittedHandler } from '../../application/types';
import {
  isModelMode,
  toSafeMediaError,
  type AppliedRealtimeState,
  type SafeMediaError,
  type SessionDraft,
  type SessionLifecycle,
  persistedReferenceAssetId,
} from '../../features/media-session';
import { toAppliedState, toProviderSnapshot, validateModelDraft } from './realtimeSnapshot';
import { useRealtimeResource, type RealtimeDisconnectReason } from './useRealtimeResource';
import type { RealtimeSessionTiming } from './realtimeSessionClock';

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
  ensureMedia: (
    requirements: {
      width: number;
      height: number;
      frameRate: number;
    },
    operation: number,
  ) => Promise<MediaStream>;
  localRef: RefObject<MediaStream | null>;
  onPromptCommitted?: PromptCommittedHandler;
};

export type ModelSessionActions = {
  remoteStream: MediaStream | null;
  sessionTiming: RealtimeSessionTiming | null;
  disconnectRealtime: () => void;
  completeExpectedRealtime: () => void;
  startModel: () => Promise<void>;
  applyChanges: () => Promise<void>;
};

const disconnectError = (reason: RealtimeDisconnectReason): SafeMediaError => {
  switch (reason) {
    case 'remote-ended':
      return {
        code: 'remote-ended',
        message: 'The transformed video ended. Local preview is still available.',
        recovery: 'Reconnect AI, continue locally, or stop the camera.',
      };
    case 'generation-ended':
      return {
        code: 'generation-ended',
        message: 'The AI generation ended before the session maximum.',
        recovery: 'Your local preview and working recipe are safe. Start AI again when ready.',
      };
    case 'provider-disconnected':
      return {
        code: 'provider-disconnected',
        message: 'The AI connection ended. Local preview is still available.',
        recovery: 'Reconnect AI, continue locally, or stop the camera.',
      };
  }
};

const realtimeStartError = (error: unknown): SafeMediaError => {
  if (error instanceof ApiClientError && error.code === 'provider_authentication') {
    return {
      code: error.code,
      message: error.message,
      recovery: 'Replace DECART_API_KEY on the API server, restart it, then start AI again.',
    };
  }
  if (error instanceof DecartRealtimeGatewayError) return error.safeError;
  return toSafeMediaError(
    error,
    'Realtime transformation could not be started. Local preview is safe.',
  );
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

  const handleProviderError = useCallback(
    (error: SafeMediaError) => {
      setError({
        code: error.code,
        message: error.message,
        ...(error.recovery ? { recovery: error.recovery } : {}),
      });
    },
    [setError],
  );

  const handleSessionLimitReached = useCallback(() => {
    setApplying(false);
    setError(null);
    setLifecycle('stopping-ai');
  }, [setApplying, setError, setLifecycle]);

  const realtime = useRealtimeResource({
    operationRef,
    onConnectionChange: setLifecycle,
    onDisconnected: handleDisconnected,
    onSessionLimitReached: handleSessionLimitReached,
    onProviderError: handleProviderError,
  });

  const notifyPromptCommitted = useCallback(
    (mode: ModelMode, draft: SessionDraft) => {
      const committedPrompt = draft.prompt.trim();
      const committedReferenceAssetId = persistedReferenceAssetId(draft.referenceImage);
      if (committedPrompt || committedReferenceAssetId) {
        onPromptCommitted?.(mode, committedPrompt, committedReferenceAssetId);
      }
    },
    [onPromptCommitted],
  );

  const startModel = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (!isModelMode(currentDraft.mode)) {
      setError({
        code: 'model-input-required',
        message: 'Choose an AI character mode before starting the AI session.',
        recovery: 'Your local camera remains available. Choose a character and try again.',
      });
      setLifecycle(hasLiveVideo(localRef.current) ? 'ready' : 'error');
      return;
    }

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
      setLifecycle('requesting-token');
      const controller = new AbortController();
      startAbortRef.current = controller;
      const token = await requestRealtimeToken(currentDraft.mode, controller.signal);
      if (operationRef.current !== operation) return;

      setLifecycle('connecting');
      const connected = await realtime.connect({
        operation,
        apiKey: token.apiKey,
        maxSessionDurationSeconds: token.maxSessionDurationSeconds,
        model: currentDraft.mode,
        localStream: stream,
        initial: toProviderSnapshot(currentDraft.mode, currentDraft),
        signal: controller.signal,
      });
      if (!connected) return;

      if (startAbortRef.current === controller) startAbortRef.current = null;
      setApplied(toAppliedState(currentDraft));
      setLifecycle((value) => (value === 'connecting' ? 'connected' : value));
      notifyPromptCommitted(currentDraft.mode, currentDraft);
    } catch (caught) {
      if (operationRef.current === operation) startAbortRef.current = null;
      if (operationRef.current !== operation) return;
      realtime.disconnect();
      setLifecycle(hasLiveVideo(localRef.current) ? 'ready' : 'error');
      setError(realtimeStartError(caught));
    }
  }, [
    decartAvailable,
    draftRef,
    ensureMedia,
    localRef,
    notifyPromptCommitted,
    operationRef,
    realtime,
    setApplied,
    setError,
    setLifecycle,
    startAbortRef,
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
      notifyPromptCommitted(currentDraft.mode, currentDraft);
    } catch (error) {
      if (operationRef.current !== operation) return;
      const safe =
        error instanceof DecartRealtimeGatewayError
          ? error.safeError
          : {
              code: 'apply-failed',
              message: 'Changes were not applied.',
              recovery: 'Review the pending draft and try Apply again.',
            };
      setError({
        ...safe,
        message:
          safe.code === 'aborted'
            ? safe.message
            : `${safe.message} The previous live recipe is still active.`,
      });
    } finally {
      if (operationRef.current === operation) setApplying(false);
    }
  }, [
    applying,
    draftRef,
    lifecycle,
    notifyPromptCommitted,
    operationRef,
    realtime,
    setApplied,
    setApplying,
    setError,
  ]);

  return {
    remoteStream: realtime.remoteStream,
    sessionTiming: realtime.sessionTiming,
    disconnectRealtime: realtime.disconnect,
    completeExpectedRealtime: realtime.completeExpectedSession,
    startModel,
    applyChanges,
  };
};
