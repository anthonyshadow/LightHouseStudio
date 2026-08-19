import type {
  ProjectProcessingAttempt,
  ProjectProcessingCapability,
  ProjectProcessingMutationResponse,
} from '@studio/contracts';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError, apiErrorMessage } from '../../adapters/api-client/apiClient';
import {
  cancelProjectProcessing,
  getCurrentProjectProcessing,
  getProjectProcessingHistory,
  reconcileProjectProcessing,
  retryProjectProcessing,
  submitProjectProcessing,
} from './projectProcessingApi';
import { getProject } from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import { useStableOperationKey } from './useStableOperationKey';

type ProjectProcessingCommandPhase =
  | 'idle'
  | 'loading'
  | 'preparing'
  | 'submitting'
  | 'retrying'
  | 'cancelling'
  | 'refreshing'
  | 'error';

type ProjectProcessingControllerState = Readonly<{
  projectId: string | null;
  phase: ProjectProcessingCommandPhase;
  attempt: ProjectProcessingAttempt | null;
  message: string | null;
  unverifiedOperationId: string | null;
  // Whether the durable operation authority for this exact Project has actually been read.
  // "No attempt in local state" is not the same fact as "no accepted operation exists", and only
  // the second one may enable a potentially billable Start.
  authorityLoaded: boolean;
}>;

const initialState = (projectId: string | null): ProjectProcessingControllerState => ({
  projectId,
  phase: projectId === null ? 'idle' : 'loading',
  attempt: null,
  message: null,
  unverifiedOperationId: null,
  authorityLoaded: false,
});

// A background status check that goes unanswered is not a broken operation. Keep presenting the
// accepted work across a blip and try again, rather than tearing the panel down into an error that
// also stops the poll; surface the failure once it is persistent enough to be real.
const BACKGROUND_POLL_FAILURE_TOLERANCE = 3;
const BACKGROUND_POLL_RETRY_MS = 4_000;

const isRecoverableHistoricalAttempt = (attempt: ProjectProcessingAttempt): boolean =>
  attempt.nextPollAfterMs !== null ||
  (attempt.phase === 'needs-attention' && attempt.blocksArchive);

const attemptNeedsProjectRefresh = (attempt: ProjectProcessingAttempt): boolean =>
  attempt.phase === 'complete' ||
  attempt.phase === 'needs-attention' ||
  attempt.phase === 'cancelled';

const commandErrorMessage = (error: unknown): string =>
  apiErrorMessage(
    error,
    'Project processing status could not be verified. Check this operation again; do not start another submission.',
  );

const operationStatusIsUnverified = (error: unknown): boolean =>
  !(error instanceof ApiClientError) || error.status >= 500 || error.code === 'invalid-response';

export const useProjectProcessingController = ({
  projectId,
  session,
  checkpointCreative,
}: {
  readonly projectId: string | null;
  readonly session: ProjectSessionPort | null;
  readonly checkpointCreative: () => Promise<boolean>;
}) => {
  const [state, setState] = useState<ProjectProcessingControllerState>(() =>
    initialState(projectId),
  );
  const stateRef = useRef(state);
  const projectIdRef = useRef(projectId);
  const sessionRef = useRef(session);
  const checkpointCreativeRef = useRef(checkpointCreative);
  const loadControllerRef = useRef<AbortController | null>(null);
  const commandControllerRef = useRef<AbortController | null>(null);
  const pollControllerRef = useRef<AbortController | null>(null);
  const commandActiveRef = useRef<symbol | null>(null);
  const pollActiveRef = useRef<symbol | null>(null);
  const pollFailuresRef = useRef(0);
  // Re-arms the poll effect after a tolerated background failure, which deliberately leaves every
  // presented value untouched and so would otherwise change nothing for the effect to key on.
  const [pollRetryNonce, setPollRetryNonce] = useState(0);
  const startOperation = useStableOperationKey();
  const retryOperation = useStableOperationKey();

  useLayoutEffect(() => {
    stateRef.current = state;
    projectIdRef.current = projectId;
    sessionRef.current = session;
    checkpointCreativeRef.current = checkpointCreative;
  }, [checkpointCreative, projectId, session, state]);

  const replaceState = useCallback((next: Omit<ProjectProcessingControllerState, 'projectId'>) => {
    const activeProjectId = projectIdRef.current;
    const value = { projectId: activeProjectId, ...next };
    stateRef.current = value;
    setState(value);
  }, []);

  const patchState = useCallback(
    (patch: Partial<Omit<ProjectProcessingControllerState, 'projectId'>>) => {
      const activeProjectId = projectIdRef.current;
      setState((current) => {
        const base =
          current.projectId === activeProjectId ? current : initialState(activeProjectId);
        const value = { ...base, ...patch, projectId: activeProjectId };
        stateRef.current = value;
        return value;
      });
    },
    [],
  );

  const synchronizeProject = useCallback(
    async (expectedProjectId: string, signal: AbortSignal): Promise<void> => {
      const activeSession = sessionRef.current;
      if (
        projectIdRef.current !== expectedProjectId ||
        activeSession?.projectId !== expectedProjectId
      ) {
        return;
      }
      const current = await getProject(expectedProjectId, signal);
      signal.throwIfAborted();
      if (
        projectIdRef.current === expectedProjectId &&
        sessionRef.current?.projectId === expectedProjectId
      ) {
        sessionRef.current.acceptCurrent(current);
      }
    },
    [],
  );

  const applyMutation = useCallback(
    async (
      response: ProjectProcessingMutationResponse,
      signal: AbortSignal,
      expectedProjectId: string,
    ): Promise<void> => {
      const attempt = response.attempt;
      if (projectIdRef.current !== expectedProjectId) return;
      patchState({
        phase: 'idle',
        attempt,
        message: null,
        unverifiedOperationId: null,
        authorityLoaded: true,
      });
      if (attemptNeedsProjectRefresh(attempt)) {
        try {
          await synchronizeProject(expectedProjectId, signal);
        } catch {
          if (!signal.aborted) {
            patchState({
              message:
                attempt.phase === 'complete' && attempt.result?.historical === false
                  ? 'The result is retained, but the current Project media could not be refreshed yet. Reopen or check status to present it.'
                  : 'Processing status changed, but the current Project summary could not be refreshed yet. Reopen or check status again.',
            });
          }
        }
      }
    },
    [patchState, synchronizeProject],
  );

  const loadAuthority = useCallback(
    async (signal: AbortSignal): Promise<ProjectProcessingAttempt | null> => {
      const activeProjectId = projectIdRef.current;
      const activeSession = sessionRef.current;
      if (activeProjectId === null || activeSession === null) return null;
      patchState({ phase: 'loading', message: null });
      try {
        const current = await getCurrentProjectProcessing(activeProjectId, signal);
        signal.throwIfAborted();
        if (
          current.currentProjectVersion !== activeSession.getCurrent()?.project.version ||
          current.currentRevisionId !== activeSession.getCurrent()?.revision.id
        ) {
          await synchronizeProject(activeProjectId, signal);
        }
        let attempt = current.attempt;
        if (attempt === null) {
          const history = await getProjectProcessingHistory(activeProjectId, undefined, signal);
          attempt =
            history.attempts.find(isRecoverableHistoricalAttempt) ??
            history.attempts.find((candidate) => candidate.result?.historical === true) ??
            null;
        }
        const prior = stateRef.current;
        if (
          attempt === null &&
          prior.projectId === activeProjectId &&
          prior.attempt !== null &&
          (prior.attempt.nextPollAfterMs !== null ||
            (prior.attempt.phase === 'complete' && prior.attempt.result?.historical === true))
        ) {
          attempt = prior.attempt;
        }
        replaceState({
          phase: 'idle',
          attempt,
          message: null,
          unverifiedOperationId: null,
          authorityLoaded: true,
        });
        if (attempt !== null && attemptNeedsProjectRefresh(attempt)) {
          try {
            await synchronizeProject(activeProjectId, signal);
          } catch {
            if (!signal.aborted) {
              patchState({
                message:
                  'Processing status was restored, but the current Project summary could not be refreshed yet.',
              });
            }
          }
        }
        return attempt;
      } catch (error) {
        if (signal.aborted) return null;
        patchState({ phase: 'error', message: commandErrorMessage(error) });
        return null;
      }
    },
    [patchState, replaceState, synchronizeProject],
  );

  const recoverExactOperation = useCallback(
    async (
      operationId: string,
      run: () => Promise<ProjectProcessingMutationResponse>,
      signal: AbortSignal,
    ): Promise<ProjectProcessingMutationResponse> => {
      try {
        return await run();
      } catch (firstError) {
        if (signal.aborted || !operationStatusIsUnverified(firstError)) throw firstError;
        try {
          return await run();
        } catch (replayError) {
          if (signal.aborted) throw replayError;
          try {
            const currentProjectId = projectIdRef.current;
            if (currentProjectId !== null) {
              const current = await getCurrentProjectProcessing(currentProjectId, signal);
              if (current.attempt?.operationId === operationId) {
                return { replayed: true, attempt: current.attempt };
              }
            }
          } catch {
            // The unverified operation remains locked below; a status read never submits work.
          }
          throw replayError;
        }
      }
    },
    [],
  );

  const start = useCallback(
    async (capability: Exclude<ProjectProcessingCapability, 'voice'>): Promise<boolean> => {
      const activeProjectId = projectIdRef.current;
      const activeSession = sessionRef.current;
      const currentState = stateRef.current;
      if (
        activeProjectId === null ||
        activeSession === null ||
        commandActiveRef.current !== null ||
        !currentState.authorityLoaded ||
        currentState.unverifiedOperationId !== null ||
        (currentState.attempt !== null &&
          (currentState.attempt.isCurrent || currentState.attempt.nextPollAfterMs !== null))
      ) {
        return false;
      }
      const commandToken = Symbol('project-processing-start');
      commandActiveRef.current = commandToken;
      patchState({
        phase: 'preparing',
        message: 'Saving the exact Project setup before submission.',
      });
      try {
        const checkpointed = await checkpointCreativeRef.current();
        if (!checkpointed) {
          patchState({
            phase: 'error',
            message: 'Save your progress, or resolve the save error, before starting.',
          });
          return false;
        }
        const current = sessionRef.current?.getCurrent() ?? null;
        if (current === null || projectIdRef.current !== activeProjectId) return false;
        const signature = JSON.stringify({
          projectId: activeProjectId,
          revisionId: current.revision.id,
          revisionNumber: current.revision.revisionNumber,
          capability,
        });
        const operationId = startOperation.keyFor(signature);
        const controller = new AbortController();
        commandControllerRef.current?.abort('project-processing-command-replaced');
        commandControllerRef.current = controller;
        patchState({ phase: 'submitting', message: null, unverifiedOperationId: null });
        const run = () =>
          submitProjectProcessing({
            projectId: activeProjectId,
            operationId,
            expectedVersion: current.project.version,
            expectedRevisionNumber: current.revision.revisionNumber,
            capability,
            signal: controller.signal,
          });
        try {
          const response = await recoverExactOperation(operationId, run, controller.signal);
          if (projectIdRef.current !== activeProjectId) return false;
          await applyMutation(response, controller.signal, activeProjectId);
          if (!attemptNeedsProjectRefresh(response.attempt)) {
            await synchronizeProject(activeProjectId, controller.signal).catch(() => undefined);
          }
          return true;
        } catch (error) {
          if (controller.signal.aborted || projectIdRef.current !== activeProjectId) return false;
          if (!operationStatusIsUnverified(error)) {
            patchState({ phase: 'error', message: commandErrorMessage(error) });
          } else {
            patchState({
              phase: 'error',
              message: commandErrorMessage(error),
              unverifiedOperationId: operationId,
            });
          }
          return false;
        } finally {
          if (commandControllerRef.current === controller) commandControllerRef.current = null;
        }
      } finally {
        if (commandActiveRef.current === commandToken) commandActiveRef.current = null;
      }
    },
    [applyMutation, patchState, recoverExactOperation, startOperation, synchronizeProject],
  );

  const retry = useCallback(async (): Promise<boolean> => {
    const activeProjectId = projectIdRef.current;
    const activeSession = sessionRef.current;
    const previous = stateRef.current.attempt;
    if (
      activeProjectId === null ||
      activeSession === null ||
      previous === null ||
      previous.retryPolicy === 'not-allowed' ||
      !previous.isCurrent ||
      commandActiveRef.current !== null
    ) {
      return false;
    }
    const commandToken = Symbol('project-processing-retry');
    commandActiveRef.current = commandToken;
    patchState({ phase: 'preparing', message: 'Confirming the exact saved Project revision.' });
    try {
      if (!(await activeSession.flush())) {
        patchState({
          phase: 'error',
          message: 'Save or discard your pending Project changes before trying again.',
        });
        return false;
      }
      const current = sessionRef.current?.getCurrent() ?? null;
      if (current === null || projectIdRef.current !== activeProjectId) return false;
      const signature = JSON.stringify({
        projectId: activeProjectId,
        previousOperationId: previous.operationId,
        revisionId: current.revision.id,
      });
      const operationId = retryOperation.keyFor(signature);
      const controller = new AbortController();
      commandControllerRef.current?.abort('project-processing-retry-replaced');
      commandControllerRef.current = controller;
      patchState({ phase: 'retrying', message: null, unverifiedOperationId: null });
      const run = () =>
        retryProjectProcessing({
          projectId: activeProjectId,
          operationId,
          previousOperationId: previous.operationId,
          expectedVersion: current.project.version,
          expectedRevisionNumber: current.revision.revisionNumber,
          capability: previous.capability,
          acknowledgePossibleDuplicateCost: previous.ambiguous,
          signal: controller.signal,
        });
      try {
        const response = await recoverExactOperation(operationId, run, controller.signal);
        if (projectIdRef.current !== activeProjectId) return false;
        await applyMutation(response, controller.signal, activeProjectId);
        if (!attemptNeedsProjectRefresh(response.attempt)) {
          await synchronizeProject(activeProjectId, controller.signal).catch(() => undefined);
        }
        return true;
      } catch (error) {
        if (controller.signal.aborted || projectIdRef.current !== activeProjectId) return false;
        if (!operationStatusIsUnverified(error)) {
          patchState({ phase: 'error', message: commandErrorMessage(error) });
        } else {
          patchState({
            phase: 'error',
            message: commandErrorMessage(error),
            unverifiedOperationId: operationId,
          });
        }
        return false;
      } finally {
        if (commandControllerRef.current === controller) commandControllerRef.current = null;
      }
    } finally {
      if (commandActiveRef.current === commandToken) commandActiveRef.current = null;
    }
  }, [applyMutation, patchState, recoverExactOperation, retryOperation, synchronizeProject]);

  const cancel = useCallback(async (): Promise<boolean> => {
    const activeProjectId = projectIdRef.current;
    const attempt = stateRef.current.attempt;
    if (
      activeProjectId === null ||
      attempt?.cancellation !== 'available' ||
      commandActiveRef.current !== null
    ) {
      return false;
    }
    const commandToken = Symbol('project-processing-cancel');
    commandActiveRef.current = commandToken;
    const controller = new AbortController();
    commandControllerRef.current = controller;
    patchState({ phase: 'cancelling', message: null });
    try {
      const response = await cancelProjectProcessing({
        projectId: activeProjectId,
        operationId: attempt.operationId,
        signal: controller.signal,
      });
      if (projectIdRef.current !== activeProjectId) return false;
      await applyMutation(response, controller.signal, activeProjectId);
      return true;
    } catch (error) {
      if (!controller.signal.aborted && projectIdRef.current === activeProjectId) {
        patchState({ phase: 'error', message: commandErrorMessage(error) });
      }
      return false;
    } finally {
      if (commandActiveRef.current === commandToken) commandActiveRef.current = null;
      if (commandControllerRef.current === controller) commandControllerRef.current = null;
    }
  }, [applyMutation, patchState]);

  /**
   * One status read, in two modes.
   *
   * A user asking "check this operation" is a visible command and reports as one. The automatic
   * poll behind an accepted operation is not: it must leave `phase` alone so the surface keeps
   * presenting steady progress instead of flipping between "processing" and "checking" on every
   * tick, and so a status read is never mistaken for work the user started.
   */
  const runReconcile = useCallback(
    async (operationId: string | undefined, background: boolean): Promise<boolean> => {
      const activeProjectId = projectIdRef.current;
      const targetOperationId = operationId ?? stateRef.current.attempt?.operationId ?? null;
      if (
        activeProjectId === null ||
        targetOperationId === null ||
        pollActiveRef.current !== null ||
        // A poll never competes with a command for the phase; the command reads authority itself.
        (background && commandActiveRef.current !== null)
      ) {
        return false;
      }
      const pollToken = Symbol('project-processing-reconcile');
      pollActiveRef.current = pollToken;
      const controller = new AbortController();
      pollControllerRef.current?.abort('project-processing-status-replaced');
      pollControllerRef.current = controller;
      if (!background) patchState({ phase: 'refreshing', message: null });
      try {
        const response = await reconcileProjectProcessing({
          projectId: activeProjectId,
          operationId: targetOperationId,
          signal: controller.signal,
        });
        if (projectIdRef.current !== activeProjectId) return false;
        pollFailuresRef.current = 0;
        await applyMutation(response, controller.signal, activeProjectId);
        return true;
      } catch (error) {
        if (controller.signal.aborted || projectIdRef.current !== activeProjectId) return false;
        pollFailuresRef.current += 1;
        if (background && pollFailuresRef.current < BACKGROUND_POLL_FAILURE_TOLERANCE) {
          // Keep the accepted operation on screen and re-arm the poll: nothing about the durable
          // operation changed just because one status read did not come back.
          setPollRetryNonce((value) => value + 1);
          return false;
        }
        patchState({ phase: 'error', message: commandErrorMessage(error) });
        return false;
      } finally {
        if (pollActiveRef.current === pollToken) pollActiveRef.current = null;
        if (pollControllerRef.current === controller) pollControllerRef.current = null;
      }
    },
    [applyMutation, patchState],
  );

  const reconcile = useCallback(
    (operationId?: string): Promise<boolean> => runReconcile(operationId, false),
    [runReconcile],
  );

  const refresh = useCallback(async (): Promise<boolean> => {
    const controller = new AbortController();
    loadControllerRef.current?.abort('project-processing-refresh-replaced');
    loadControllerRef.current = controller;
    const attempt = await loadAuthority(controller.signal);
    if (loadControllerRef.current === controller) loadControllerRef.current = null;
    return attempt !== null || stateRef.current.phase === 'idle';
  }, [loadAuthority]);

  const revisionId = session?.current?.revision.id ?? null;
  const sessionProjectId = session?.projectId ?? null;
  useEffect(() => {
    commandControllerRef.current?.abort('project-processing-project-replaced');
    commandControllerRef.current = null;
    commandActiveRef.current = null;
  }, [projectId]);

  useEffect(() => {
    loadControllerRef.current?.abort('project-processing-context-replaced');
    pollControllerRef.current?.abort('project-processing-context-replaced');
    pollActiveRef.current = null;
    startOperation.reset();
    retryOperation.reset();
    pollFailuresRef.current = 0;
    replaceState({
      phase: projectId === null || sessionProjectId === null ? 'idle' : 'loading',
      attempt: null,
      message: null,
      unverifiedOperationId: null,
      authorityLoaded: false,
    });
    if (
      projectId === null ||
      sessionProjectId !== projectId ||
      revisionId === null ||
      commandActiveRef.current !== null
    ) {
      return;
    }
    const controller = new AbortController();
    loadControllerRef.current = controller;
    void loadAuthority(controller.signal).finally(() => {
      if (loadControllerRef.current === controller) loadControllerRef.current = null;
    });
    return () => controller.abort('project-processing-hydration-replaced');
  }, [
    loadAuthority,
    projectId,
    replaceState,
    retryOperation,
    revisionId,
    sessionProjectId,
    startOperation,
  ]);

  // State belonging to another Project is not a partial view of this one — discard all of it.
  const { attempt, authorityLoaded, phase, message, unverifiedOperationId } =
    state.projectId === projectId ? state : initialState(projectId);

  useEffect(() => {
    if (
      attempt?.nextPollAfterMs === null ||
      attempt?.nextPollAfterMs === undefined ||
      phase !== 'idle'
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => {
        void runReconcile(attempt.operationId, true);
      },
      pollFailuresRef.current > 0 ? BACKGROUND_POLL_RETRY_MS : attempt.nextPollAfterMs,
    );
    return () => window.clearTimeout(timer);
  }, [attempt, phase, pollRetryNonce, runReconcile]);

  useEffect(
    () => () => {
      loadControllerRef.current?.abort('project-processing-controller-unmounted');
      commandControllerRef.current?.abort('project-processing-controller-unmounted');
      pollControllerRef.current?.abort('project-processing-controller-unmounted');
    },
    [],
  );

  return useMemo(
    () => ({
      phase,
      attempt,
      message,
      unverifiedOperationId,
      busy: ['loading', 'preparing', 'submitting', 'retrying', 'cancelling', 'refreshing'].includes(
        phase,
      ),
      active: attempt?.nextPollAfterMs !== null && attempt?.nextPollAfterMs !== undefined,
      authorityReady: phase === 'idle' && unverifiedOperationId === null && authorityLoaded,
      start,
      retry,
      cancel,
      reconcile,
      refresh,
    }),
    [
      attempt,
      authorityLoaded,
      cancel,
      message,
      phase,
      reconcile,
      refresh,
      retry,
      start,
      unverifiedOperationId,
    ],
  );
};

export type ProjectProcessingController = ReturnType<typeof useProjectProcessingController>;
