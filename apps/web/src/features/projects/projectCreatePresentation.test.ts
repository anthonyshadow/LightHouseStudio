import type { ProjectCurrentResponse, ProjectProcessingAttempt } from '@studio/contracts';
import { describe, expect, it } from 'vitest';
import {
  effectiveCreativeSnapshot,
  projectCreateLaunchers,
  projectCurrentCutNotice,
  type ProjectCreateLauncherInput,
  type ProjectCurrentCutPhase,
} from './projectCreatePresentation';

type Snapshot = ProjectCurrentResponse['revision']['snapshot'];

const now = '2026-08-14T12:00:00.000Z';

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  schemaVersion: 2,
  sourceAssetId: '79b94c02-d268-4201-a05b-1f3baa0caed1',
  workingMedia: null,
  presentedMedia: null,
  selectedCharacter: null,
  selectedOutfit: null,
  selectedVoice: null,
  visualTreatment: { kind: 'none' },
  liveMode: null,
  creativeIntent: {
    promptId: null,
    promptLabel: null,
    recipeId: null,
    recipeLabel: null,
    userIntent: '',
    appliedPrompt: null,
    referenceAssetId: null,
    resourceRevision: null,
  },
  localEdit: null,
  exportSpecification: null,
  lastSuccessfulOutput: null,
  workflowPhase: 'creative',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const attempt = (overrides: Partial<ProjectProcessingAttempt> = {}): ProjectProcessingAttempt => ({
  operationId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
  capability: 'character-swap',
  attemptNumber: 1,
  retryOfOperationId: null,
  initiatingRevisionId: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  initiatingRevisionNumber: 2,
  phase: 'accepted',
  isCurrent: true,
  ambiguous: false,
  cancellation: 'unsupported',
  retryPolicy: 'not-allowed',
  blocksArchive: true,
  createdAt: now,
  updatedAt: now,
  acceptedAt: now,
  completedAt: null,
  expiresAt: '2026-08-14T13:00:00.000Z',
  nextPollAfterMs: 10_000,
  result: null,
  error: null,
  ...overrides,
});

const launcherInput = (
  overrides: Partial<ProjectCreateLauncherInput> = {},
): ProjectCreateLauncherInput => ({
  snapshot: snapshot(),
  archived: false,
  attempt: null,
  authorityReady: true,
  characterSwapAvailable: true,
  virtualTryOnAvailable: true,
  visualIncompatibilityReason: null,
  editorBlockedReason: undefined,
  sourceBusy: false,
  workingMediaBusy: false,
  ...overrides,
});

const reasonFor = (input: ProjectCreateLauncherInput) =>
  Object.fromEntries(
    projectCreateLaunchers(input).map((launcher) => [launcher.id, launcher.blockedReason]),
  );

describe('effectiveCreativeSnapshot', () => {
  it('returns the settled snapshot when nothing is pending', () => {
    const settled = snapshot();
    expect(effectiveCreativeSnapshot(settled, null)).toBe(settled);
  });

  it('lays a pending pick over the settled snapshot, so the panel never lags behind a choice', () => {
    const merged = effectiveCreativeSnapshot(snapshot(), {
      workflowPhase: 'creative',
      liveMode: null,
      selectedCharacter: {
        characterId: 'a',
        characterLabel: 'Ada',
        characterRevision: now,
        variantId: null,
        variantLabel: null,
        variantRevision: null,
        referenceAssetId: null,
      },
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'character-swap', providerId: null, outputResolution: null },
      creativeIntent: snapshot().creativeIntent,
      localEdit: null,
      exportSpecification: null,
    });

    expect(merged.selectedCharacter?.characterLabel).toBe('Ada');
    expect(merged.visualTreatment.kind).toBe('character-swap');
    // Everything the proposal does not carry is left exactly as the Project has it.
    expect(merged.sourceAssetId).toBe(snapshot().sourceAssetId);
  });
});

describe('projectCreateLaunchers', () => {
  it('offers three edits and marks only the two that reach a provider as billable', () => {
    const launchers = projectCreateLaunchers(launcherInput());

    expect(launchers.map((launcher) => launcher.id)).toEqual([
      'character-swap',
      'virtual-try-on',
      'adjust',
    ]);
    expect(launchers.every((launcher) => launcher.blockedReason === null)).toBe(true);
    expect(launchers[0]?.cost).toMatch(/can cost money/u);
    expect(launchers[1]?.cost).toMatch(/can cost money/u);
    // Nothing to warn about, so nothing said — a cost line on a free action is noise.
    expect(launchers[2]?.cost).toBeNull();
  });

  it('carries the choice each AI edit consumes on the card that consumes it', () => {
    const chosen = projectCreateLaunchers(
      launcherInput({
        snapshot: snapshot({
          selectedCharacter: {
            characterId: 'a',
            characterLabel: 'Ada',
            characterRevision: now,
            variantId: 'v',
            variantLabel: 'Evening',
            variantRevision: now,
            referenceAssetId: null,
          },
          selectedOutfit: {
            outfitId: 'o',
            outfitLabel: 'Red jacket',
            outfitRevision: now,
            referenceAssetId: null,
            inputKind: 'saved-outfit',
          },
        }),
      }),
    );

    expect(chosen[0]?.input).toMatchObject({ kind: 'character', value: 'Ada · Evening' });
    expect(chosen[1]?.input).toMatchObject({ kind: 'outfit', value: 'Red jacket' });
    // The on-device editor consumes no creative choice, so it offers none.
    expect(chosen[2]?.input).toBeNull();
  });

  it('leaves an unmade choice null so one caller decides how to word it', () => {
    const empty = projectCreateLaunchers(launcherInput());
    expect(empty[0]?.input?.value).toBeNull();
    expect(empty[1]?.input?.value).toBeNull();
  });

  it('states the first true refusal and nothing else', () => {
    // Archived outranks an unresolved run, which outranks an unconfigured provider.
    expect(
      reasonFor(
        launcherInput({
          archived: true,
          attempt: attempt(),
          characterSwapAvailable: false,
        }),
      )['character-swap'],
    ).toBe('This Project is archived.');

    expect(reasonFor(launcherInput({ attempt: attempt() }))['character-swap']).toMatch(
      /accepted provider work is running/u,
    );
    expect(
      reasonFor(launcherInput({ attempt: attempt({ ambiguous: true }) }))['character-swap'],
    ).toMatch(/unclear whether the provider accepted/u);
    expect(reasonFor(launcherInput({ authorityReady: false }))['character-swap']).toMatch(
      /Starting stays unavailable/u,
    );
    expect(reasonFor(launcherInput({ characterSwapAvailable: false }))['character-swap']).toMatch(
      /unavailable in the current server configuration/u,
    );
    expect(
      reasonFor(launcherInput({ visualIncompatibilityReason: 'Too tall.' }))['character-swap'],
    ).toBe('Too tall.');
  });

  it('never blocks the on-device editor for a provider condition', () => {
    const blocked = reasonFor(
      launcherInput({
        attempt: attempt(),
        authorityReady: false,
        characterSwapAvailable: false,
        virtualTryOnAvailable: false,
        visualIncompatibilityReason: 'Too tall.',
      }),
    );

    expect(blocked['character-swap']).not.toBeNull();
    expect(blocked['virtual-try-on']).not.toBeNull();
    expect(blocked['adjust']).toBeNull();
  });

  it('blocks every edit on a Project whose own media is not ready', () => {
    expect(reasonFor(launcherInput({ sourceBusy: true }))).toEqual({
      'character-swap': 'Loading this Project’s original video onto the stage.',
      'virtual-try-on': 'Loading this Project’s original video onto the stage.',
      adjust: 'Loading this Project’s original video onto the stage.',
    });
    expect(
      reasonFor(launcherInput({ editorBlockedReason: 'Finish the current take first.' })),
    ).toEqual({
      'character-swap': 'Finish the current take first.',
      'virtual-try-on': 'Finish the current take first.',
      adjust: 'Finish the current take first.',
    });
    expect(reasonFor(launcherInput({ workingMediaBusy: true }))['adjust']).toBe(
      'Finish updating the current cut before starting an edit.',
    );
  });
});

describe('projectCurrentCutNotice', () => {
  it('reads differently for each adoption at every phase, so two at once stay distinguishable', () => {
    const phases: readonly ProjectCurrentCutPhase[] = [
      'idle',
      'saving',
      'saved',
      'conflict',
      'error',
    ];

    for (const phase of phases) {
      const saved = projectCurrentCutNotice('saved-version', phase);
      const local = projectCurrentCutNotice('local-render', phase);
      expect(saved.title).not.toBe(local.title);
      expect(saved.tone).toBe(local.tone);
      expect(saved.role).toBe(local.role);
    }
  });

  it('escalates an unresolved adoption to an alert', () => {
    expect(projectCurrentCutNotice('saved-version', 'saved')).toEqual({
      title: 'Current cut updated',
      tone: 'success',
      role: 'status',
    });
    expect(projectCurrentCutNotice('local-render', 'error')).toEqual({
      title: 'Edit not used',
      tone: 'danger',
      role: 'alert',
    });
  });
});
