import { describe, expect, it } from 'vitest';
import { createInitialGuidedFlowState, guidedFlowReducer, restoreGuidedFlowState } from './machine';
import { createEmptyGuidedProjectData, type GuidedProjectCheckpoint } from './types';

describe('guidedFlowReducer', () => {
  it('requires an explicit reference choice and guards stale async completions', () => {
    let transition = guidedFlowReducer(createInitialGuidedFlowState('project-1'), {
      type: 'save-character-requested',
    });
    expect(transition.state.status).toBe('create.reference-choice');
    expect(transition.effects).toEqual([]);

    transition = guidedFlowReducer(transition.state, {
      type: 'reference-mode-selected',
      mode: 'prompt-only',
      operationId: 'save-1',
    });
    expect(transition.state.status).toBe('create.saving');
    expect(transition.effects).toEqual([
      expect.objectContaining({
        operation: 'save-character-prompt-only',
        operationId: 'save-1',
        baseRevision: 0,
      }),
    ]);

    const stale = guidedFlowReducer(transition.state, {
      type: 'character-saved',
      operationId: 'older-save',
      baseRevision: 0,
      nextRevision: 1,
    });
    expect(stale.state).toBe(transition.state);

    const futureRevision = guidedFlowReducer(transition.state, {
      type: 'character-saved',
      operationId: 'save-1',
      baseRevision: 0,
      nextRevision: 2,
    });
    expect(futureRevision.state).toBe(transition.state);

    const saved = guidedFlowReducer(transition.state, {
      type: 'character-saved',
      operationId: 'save-1',
      baseRevision: 0,
      nextRevision: 1,
      data: { characterId: 'character-1', referenceMode: 'prompt-only' },
    });
    expect(saved.state).toMatchObject({
      status: 'live.ready',
      projectRevision: 1,
      pending: null,
      data: { characterId: 'character-1', referenceMode: 'prompt-only' },
    });
  });

  it('does not generate a reference until settings are confirmed', () => {
    const choice = guidedFlowReducer(
      { ...createInitialGuidedFlowState(), status: 'create.reference-choice' },
      { type: 'reference-mode-selected', mode: 'generate', operationId: 'ignored-until-confirm' },
    );
    expect(choice.state.status).toBe('create.reference-settings');
    expect(choice.effects).toEqual([]);

    const confirmed = guidedFlowReducer(choice.state, {
      type: 'reference-generation-confirmed',
      operationId: 'generate-1',
    });
    expect(confirmed.state.status).toBe('create.saving');
    expect(confirmed.effects[0]).toMatchObject({
      operation: 'save-character-with-reference',
      referenceMode: 'generate',
    });
  });

  it('can continue prompt-only directly after reference generation fails', () => {
    const settings = {
      ...createInitialGuidedFlowState(),
      status: 'create.reference-settings' as const,
      error: 'Generation failed',
    };
    const continued = guidedFlowReducer(settings, {
      type: 'reference-mode-selected',
      mode: 'prompt-only',
      operationId: 'prompt-fallback-1',
    });
    expect(continued.state).toMatchObject({
      status: 'create.saving',
      error: null,
      pending: { kind: 'save-character-prompt-only' },
    });
  });

  it('returns to an explicit camera restart before re-recording', () => {
    const state = { ...createInitialGuidedFlowState(), status: 'record.review' as const };
    expect(guidedFlowReducer(state, { type: 're-record-requested' }).state.status).toBe(
      'live.ready',
    );
  });

  it('requires local camera preview before an explicit AI connection', () => {
    const ready = { ...createInitialGuidedFlowState(), status: 'live.ready' as const };
    const primer = guidedFlowReducer(ready, { type: 'live-start-requested' }).state;
    expect(primer.status).toBe('live.permission-primer');

    const cameraStarting = guidedFlowReducer(primer, {
      type: 'live-permission-confirmed',
      operationId: 'camera-1',
    }).state;
    expect(cameraStarting).toMatchObject({
      status: 'live.camera-starting',
      pending: { kind: 'start-camera-preview', rollbackStatus: 'live.ready' },
    });

    const cameraReady = guidedFlowReducer(cameraStarting, {
      type: 'camera-preview-started',
      operationId: 'camera-1',
      baseRevision: 0,
    }).state;
    expect(cameraReady.status).toBe('live.camera-ready');

    const aiStarting = guidedFlowReducer(cameraReady, {
      type: 'ai-start-requested',
      operationId: 'ai-1',
    }).state;
    expect(aiStarting).toMatchObject({
      status: 'live.connecting',
      pending: { kind: 'start-live-session', rollbackStatus: 'live.camera-ready' },
    });

    const connected = guidedFlowReducer(aiStarting, {
      type: 'live-connected',
      operationId: 'ai-1',
      baseRevision: 0,
    }).state;
    expect(connected.status).toBe('live.connected');
    expect(guidedFlowReducer(connected, { type: 'ai-stopped' }).state.status).toBe(
      'live.camera-ready',
    );
    expect(guidedFlowReducer(connected, { type: 'camera-stopped' }).state.status).toBe(
      'live.ready',
    );
  });

  it('reconciles a live local preview when durable flow state is still camera-off', () => {
    const ready = { ...createInitialGuidedFlowState(), status: 'live.ready' as const };
    const reconciled = guidedFlowReducer(ready, { type: 'local-preview-reconciled' });

    expect(reconciled.state).toMatchObject({
      status: 'live.camera-ready',
      pending: null,
      error: null,
    });
    expect(reconciled.effects).toEqual([]);

    const primer = guidedFlowReducer(ready, { type: 'live-start-requested' }).state;
    expect(guidedFlowReducer(primer, { type: 'local-preview-reconciled' }).state).toMatchObject({
      status: 'live.camera-ready',
      pending: null,
    });

    const cameraStarting = guidedFlowReducer(primer, {
      type: 'live-permission-confirmed',
      operationId: 'camera-reconcile-1',
    }).state;
    expect(
      guidedFlowReducer(cameraStarting, { type: 'local-preview-reconciled' }).state,
    ).toMatchObject({ status: 'live.camera-ready', pending: null });

    const unrelated = { ...createInitialGuidedFlowState(), status: 'create.editing' as const };
    expect(guidedFlowReducer(unrelated, { type: 'local-preview-reconciled' }).state).toBe(
      unrelated,
    );
  });

  it('reconciles usable AI video before continuing to Record', () => {
    const cameraReady = {
      ...createInitialGuidedFlowState(),
      status: 'live.camera-ready' as const,
    };
    const connecting = guidedFlowReducer(cameraReady, {
      type: 'ai-start-requested',
      operationId: 'ai-reconcile-1',
    }).state;
    const connected = guidedFlowReducer(connecting, { type: 'ai-preview-reconciled' }).state;

    expect(connected).toMatchObject({ status: 'live.connected', pending: null, error: null });
    expect(guidedFlowReducer(connected, { type: 'continue-to-record' }).state.status).toBe(
      'record.ready',
    );
  });

  it('returns a failed re-record start to the actionable prior take', () => {
    const data = {
      ...createEmptyGuidedProjectData(),
      originalVideoArtifactId: 'original-1',
    };
    const ready = {
      ...createInitialGuidedFlowState(),
      status: 'record.ready' as const,
      data,
    };
    const countdown = guidedFlowReducer(ready, {
      type: 'countdown-started',
      endsAt: 1_000,
    }).state;
    const starting = guidedFlowReducer(countdown, {
      type: 'countdown-finished',
      operationId: 're-record-1',
    }).state;

    expect(starting).toMatchObject({
      status: 'record.starting',
      pending: { kind: 'start-recording', rollbackStatus: 'record.review' },
    });

    const failed = guidedFlowReducer(starting, {
      type: 'operation-failed',
      operationId: 're-record-1',
      baseRevision: 0,
      message: 'Recorder could not start.',
    }).state;
    expect(failed).toMatchObject({
      status: 'record.review',
      pending: null,
      error: 'Recorder could not start.',
    });
    expect(failed.data).toBe(data);

    const firstTakeCountdown = {
      ...createInitialGuidedFlowState(),
      status: 'record.countdown' as const,
      countdownEndsAt: 1_000,
    };
    const firstTakeStarting = guidedFlowReducer(firstTakeCountdown, {
      type: 'countdown-finished',
      operationId: 'first-take-1',
    }).state;
    const firstTakeFailed = guidedFlowReducer(firstTakeStarting, {
      type: 'operation-failed',
      operationId: 'first-take-1',
      baseRevision: 0,
      message: 'Recorder could not start.',
    }).state;
    expect(firstTakeFailed.status).toBe('record.ready');
  });

  it('guards reconnect refresh completion and recovers to the prior actionable state', () => {
    const firstTakeReady = {
      ...createInitialGuidedFlowState(),
      status: 'record.ready' as const,
    };
    const refreshing = guidedFlowReducer(firstTakeReady, {
      type: 'record-session-refresh-requested',
      operationId: 'refresh-1',
    });
    expect(refreshing.state).toMatchObject({
      status: 'record.refreshing',
      pending: { kind: 'refresh-live-session', rollbackStatus: 'live.camera-ready' },
    });
    expect(refreshing.effects[0]).toMatchObject({
      operation: 'refresh-live-session',
      operationId: 'refresh-1',
      baseRevision: 0,
    });

    const stale = guidedFlowReducer(refreshing.state, {
      type: 'record-session-refreshed',
      operationId: 'older-refresh',
      baseRevision: 0,
      endsAt: 2_000,
    });
    expect(stale.state).toBe(refreshing.state);

    const firstTakeFailed = guidedFlowReducer(refreshing.state, {
      type: 'operation-failed',
      operationId: 'refresh-1',
      baseRevision: 0,
      message: 'AI session could not reconnect.',
    }).state;
    expect(firstTakeFailed).toMatchObject({
      status: 'live.camera-ready',
      pending: null,
      error: 'AI session could not reconnect.',
    });

    const refreshed = guidedFlowReducer(refreshing.state, {
      type: 'record-session-refreshed',
      operationId: 'refresh-1',
      baseRevision: 0,
      endsAt: 2_000,
    }).state;
    expect(refreshed).toMatchObject({
      status: 'record.countdown',
      pending: null,
      countdownEndsAt: 2_000,
    });

    const priorTakeReady = {
      ...firstTakeReady,
      data: {
        ...createEmptyGuidedProjectData(),
        originalVideoArtifactId: 'original-1',
      },
    };
    const priorTakeRefresh = guidedFlowReducer(priorTakeReady, {
      type: 'record-session-refresh-requested',
      operationId: 'refresh-2',
    }).state;
    const failed = guidedFlowReducer(priorTakeRefresh, {
      type: 'operation-failed',
      operationId: 'refresh-2',
      baseRevision: 0,
      message: 'AI session could not reconnect.',
    }).state;
    expect(failed).toMatchObject({
      status: 'record.review',
      pending: null,
      error: 'AI session could not reconnect.',
    });
  });

  it('cancels each pre-record transition safely when AI or camera is stopped', () => {
    const ready = { ...createInitialGuidedFlowState(), status: 'record.ready' as const };
    const refreshing = guidedFlowReducer(ready, {
      type: 'record-session-refresh-requested',
      operationId: 'refresh-stop',
    }).state;
    const countdown = guidedFlowReducer(ready, {
      type: 'countdown-started',
      endsAt: 1_000,
    }).state;
    const starting = guidedFlowReducer(countdown, {
      type: 'countdown-finished',
      operationId: 'record-stop',
    }).state;

    for (const state of [refreshing, countdown, starting]) {
      expect(guidedFlowReducer(state, { type: 'ai-stopped' }).state).toMatchObject({
        status: 'live.camera-ready',
        pending: null,
        countdownEndsAt: null,
        recordingDeadlineAt: null,
      });
      expect(guidedFlowReducer(state, { type: 'camera-stopped' }).state).toMatchObject({
        status: 'live.ready',
        pending: null,
        countdownEndsAt: null,
        recordingDeadlineAt: null,
      });
    }
  });

  it('keeps a finalized take reviewable when its durable checkpoint fails', () => {
    const recording = {
      ...createInitialGuidedFlowState(),
      status: 'record.recording' as const,
    };
    const finalizing = guidedFlowReducer(recording, {
      type: 'recording-stop-requested',
      operationId: 'stop-first-take',
    }).state;
    expect(finalizing).toMatchObject({
      status: 'record.finalizing',
      pending: { kind: 'stop-recording', rollbackStatus: 'live.ready' },
    });

    const runtimeData = {
      originalVideoArtifactId: 'original-runtime-1',
      originalAudioArtifactId: 'audio-runtime-1',
    };
    const recovered = guidedFlowReducer(finalizing, {
      type: 'recording-checkpoint-failed',
      operationId: 'stop-first-take',
      baseRevision: 0,
      message: 'The take is safe in this tab but still needs to be saved.',
      data: runtimeData,
    }).state;
    expect(recovered).toMatchObject({
      status: 'record.review',
      pending: null,
      error: 'The take is safe in this tab but still needs to be saved.',
      data: runtimeData,
    });
  });

  it('rolls a failed recording finalization back to the nearest actionable state', () => {
    const firstTake = {
      ...createInitialGuidedFlowState(),
      status: 'record.recording' as const,
    };
    const firstFinalizing = guidedFlowReducer(firstTake, {
      type: 'recording-stop-requested',
      operationId: 'stop-first',
    }).state;
    expect(
      guidedFlowReducer(firstFinalizing, {
        type: 'operation-failed',
        operationId: 'stop-first',
        baseRevision: 0,
        message: 'Finalization failed.',
      }).state,
    ).toMatchObject({ status: 'live.ready', pending: null, error: 'Finalization failed.' });

    const priorTake = {
      ...firstTake,
      data: {
        ...createEmptyGuidedProjectData(),
        originalVideoArtifactId: 'original-prior',
      },
    };
    const replacementFinalizing = guidedFlowReducer(priorTake, {
      type: 'recording-stop-requested',
      operationId: 'stop-replacement',
    }).state;
    expect(
      guidedFlowReducer(replacementFinalizing, {
        type: 'operation-failed',
        operationId: 'stop-replacement',
        baseRevision: 0,
        message: 'Replacement failed.',
      }).state,
    ).toMatchObject({ status: 'record.review', pending: null, error: 'Replacement failed.' });
  });

  it('cannot strand download dispatch when the completion checkpoint fails', () => {
    const ready = {
      ...createInitialGuidedFlowState('project-1'),
      status: 'download.ready' as const,
      projectRevision: 4,
    };
    const dispatching = guidedFlowReducer(ready, {
      type: 'download-requested',
      operationId: 'download-1',
    }).state;
    const completion = guidedFlowReducer(dispatching, {
      type: 'download-dispatched',
      operationId: 'download-1',
      baseRevision: 4,
      nextRevision: 5,
      data: { downloadStartedAt: '2026-07-21T00:00:00.000Z' },
    }).state;

    expect(completion).toMatchObject({
      status: 'download.dispatching',
      projectRevision: 5,
      pending: {
        id: 'download-1:complete',
        kind: 'complete-project',
        baseRevision: 5,
        rollbackStatus: 'download.ready',
      },
      data: { downloadStartedAt: '2026-07-21T00:00:00.000Z' },
    });

    const unrelatedFailure = guidedFlowReducer(completion, {
      type: 'operation-failed',
      operationId: 'another-download',
      baseRevision: 4,
      message: 'Stale failure.',
    });
    expect(unrelatedFailure.state).toBe(completion);

    const failed = guidedFlowReducer(completion, {
      type: 'operation-failed',
      operationId: 'download-1',
      baseRevision: 4,
      message: 'Completion checkpoint needs a retry.',
    }).state;
    expect(failed).toMatchObject({
      status: 'download.ready',
      projectRevision: 5,
      pending: null,
      error: 'Completion checkpoint needs a retry.',
      data: { downloadStartedAt: '2026-07-21T00:00:00.000Z' },
    });
  });

  it('returns from voice review without discarding the current selection or artifacts', () => {
    const data = {
      ...createEmptyGuidedProjectData(),
      selectedVoiceId: 'voice-1',
      processedVideoArtifactId: 'processed-1',
      finalVariant: 'processed' as const,
    };
    const state = {
      ...createInitialGuidedFlowState(),
      status: 'voice.review' as const,
      data,
    };
    const next = guidedFlowReducer(state, { type: 'choose-another-voice' }).state;
    expect(next.status).toBe('voice.choosing');
    expect(next.data).toBe(data);
  });

  it('returns a cancelled voice operation to the chooser without changing saved data', () => {
    const data = { ...createEmptyGuidedProjectData(), selectedVoiceId: 'voice-1' };
    const processing = guidedFlowReducer(
      { ...createInitialGuidedFlowState(), status: 'voice.choosing', data },
      { type: 'voice-apply-requested', operationId: 'voice-1' },
    ).state;
    const cancelled = guidedFlowReducer(processing, { type: 'voice-processing-cancelled' }).state;
    expect(cancelled).toMatchObject({ status: 'voice.choosing', pending: null, error: null });
    expect(cancelled.data).toBe(data);
  });

  it('marks an attached reference stale on character edits without mutating user selections', () => {
    const state = {
      ...createInitialGuidedFlowState(),
      data: {
        ...createEmptyGuidedProjectData(),
        referenceImageAssetId: 'reference-1',
        referenceImageStale: false,
      },
    };
    const next = guidedFlowReducer(state, {
      type: 'character-edited',
      data: { characterName: 'Updated name' },
    }).state;
    expect(next.data).toMatchObject({
      characterName: 'Updated name',
      referenceImageAssetId: 'reference-1',
      referenceImageStale: true,
    });
  });

  it('prepares an unchanged character save without invalidating its reference', () => {
    const state = {
      ...createInitialGuidedFlowState(),
      data: {
        ...createEmptyGuidedProjectData(),
        referenceImageAssetId: 'reference-1',
        referenceImageStale: false,
      },
    };
    const next = guidedFlowReducer(state, {
      type: 'character-save-prepared',
      data: { characterName: 'Still the same character', characterPrompt: 'Prompt' },
    }).state;
    expect(next.data).toMatchObject({
      characterName: 'Still the same character',
      referenceImageAssetId: 'reference-1',
      referenceImageStale: false,
    });
  });

  it('tells the effect runner which voice variant to checkpoint', () => {
    const state = { ...createInitialGuidedFlowState(), status: 'voice.review' as const };
    expect(
      guidedFlowReducer(state, { type: 'keep-original-requested', operationId: 'original-1' })
        .effects[0],
    ).toMatchObject({ operation: 'keep-original', finalVariant: 'original' });
    expect(
      guidedFlowReducer(state, { type: 'processed-voice-accepted', operationId: 'processed-1' })
        .effects[0],
    ).toMatchObject({ operation: 'accept-processed-voice', finalVariant: 'processed' });
  });

  it.each<[GuidedProjectCheckpoint, string]>([
    ['character-design', 'create.editing'],
    ['character-ready', 'live.ready'],
    ['review-take', 'record.review'],
    ['accepted-take', 'voice.choosing'],
    ['selected-voice', 'voice.choosing'],
    ['processed-voice', 'voice.review'],
    ['delivery-ready', 'download.ready'],
    ['complete', 'download.complete'],
  ])('restores %s to the stable %s state', (checkpoint, status) => {
    const restored = restoreGuidedFlowState({
      schemaVersion: 1,
      id: 'project-1',
      title: 'A project',
      revision: 7,
      checkpoint,
      data: createEmptyGuidedProjectData(),
      createdAt: '2026-07-20T12:00:00.000Z',
      updatedAt: '2026-07-20T12:01:00.000Z',
    });
    expect(restored).toMatchObject({ status, projectRevision: 7, restoredFrom: checkpoint });
    expect(restored.pending).toBeNull();
  });
});
