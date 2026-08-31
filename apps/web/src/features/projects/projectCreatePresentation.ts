import type {
  ProjectCurrentResponse,
  ProjectProcessingAttempt,
  ProjectSessionProposalContract,
} from '@studio/contracts';
import { LOCAL_EFFECTS, type LocalVoiceEffectId } from '../voice-effects/types';
import {
  VIDEO_TRANSFORM_OPERATION_DESCRIPTIONS,
  VIDEO_TRANSFORM_OPERATION_LABELS,
  VIDEO_TRANSFORM_UNAVAILABLE_REASON,
} from '../existing-video/videoTransformLabels';
import {
  PROJECT_PROCESSING_AUTHORITY_PENDING_REASON,
  PROJECT_PROCESSING_START_COST_NOTE,
  projectProcessingBlockedReason,
} from './projectProcessingPresentation';

type Snapshot = ProjectCurrentResponse['revision']['snapshot'];

/**
 * What the Project's creative setup is *right now*, pending write included.
 *
 * `propose` records a change without touching `current` — the settled snapshot only moves when a
 * save lands. Reading the snapshot alone would leave this panel a second behind every pick, and
 * wrong outright if the save failed, so the pending proposal is laid over it.
 */
export const effectiveCreativeSnapshot = (
  snapshot: Snapshot,
  proposal: ProjectSessionProposalContract | null,
): Snapshot => (proposal === null ? snapshot : { ...snapshot, ...proposal });

/** The three edits a Project can start from the Create task. */
export type ProjectCreateOperationId = 'character-swap' | 'virtual-try-on' | 'adjust';

/** Every creative resource the setup summary can send the operator back to choose again. */
export type ProjectCreativeResourceKind =
  'character' | 'character-variant' | 'outfit' | 'voice' | 'prompt' | 'recipe' | 'reference';

/**
 * A built-in voice treatment, named the way the chooser names it. Read from the catalog rather than
 * restated: a second table here already disagreed with it about one of the three.
 */
export const localVoiceName = (effectId: LocalVoiceEffectId): string =>
  LOCAL_EFFECTS.find((effect) => effect.id === effectId)?.name ?? 'Local treatment';

const characterValue = (snapshot: Snapshot): string | null => {
  const character = snapshot.selectedCharacter;
  if (character === null) return null;
  const name = character.characterLabel ?? 'Saved character';
  return character.variantLabel ? `${name} · ${character.variantLabel}` : name;
};

export interface ProjectCreateLauncherInputRow {
  readonly kind: ProjectCreativeResourceKind;
  readonly label: string;
  /** The saved selection, or null when this Project has never chosen one. */
  readonly value: string | null;
}

export interface ProjectCreateLauncher {
  readonly id: ProjectCreateOperationId;
  readonly title: string;
  readonly description: string;
  /** What this operation works from, on the card rather than in a section of its own. */
  readonly input: ProjectCreateLauncherInputRow | null;
  /** The standing cost warning, on the two operations that can actually incur one. */
  readonly cost: string | null;
  readonly actionLabel: string;
  /** Why this cannot start right now, or null when it can. */
  readonly blockedReason: string | null;
}

export interface ProjectCreateLauncherInput {
  readonly snapshot: Snapshot;
  readonly archived: boolean;
  readonly attempt: ProjectProcessingAttempt | null;
  readonly authorityReady: boolean;
  readonly characterSwapAvailable: boolean;
  readonly virtualTryOnAvailable: boolean;
  readonly visualIncompatibilityReason: string | null;
  /** Why the editor itself cannot open — a take in progress, or nothing on the stage. */
  readonly editorBlockedReason: string | undefined;
  readonly sourceBusy: boolean;
  readonly workingMediaBusy: boolean;
}

const ARCHIVED_REASON = 'This Project is archived.';
const SOURCE_LOADING_REASON = 'Loading this Project’s original video onto the stage.';
const WORKING_MEDIA_BUSY_REASON = 'Finish updating the current cut before starting an edit.';

/**
 * Why every launcher cannot act, in one precedence.
 *
 * Ordering is the whole contract: the first true condition is the one stated, so an archived
 * Project never explains a provider queue and a Project whose source is still streaming never
 * claims it has no video. The provider conditions apply only to the two operations that reach a
 * provider — blocking the on-device editor because a remote run is queued would be a lie.
 */
const launcherBlockedReason = (
  operation: ProjectCreateOperationId,
  input: ProjectCreateLauncherInput,
): string | null => {
  if (input.archived) return ARCHIVED_REASON;
  if (operation !== 'adjust') {
    const attemptReason = projectProcessingBlockedReason(input.attempt, 'create-start');
    if (attemptReason !== undefined) return attemptReason;
    if (!input.authorityReady) return PROJECT_PROCESSING_AUTHORITY_PENDING_REASON;
    const available =
      operation === 'character-swap' ? input.characterSwapAvailable : input.virtualTryOnAvailable;
    if (!available) return VIDEO_TRANSFORM_UNAVAILABLE_REASON;
    if (input.visualIncompatibilityReason !== null) return input.visualIncompatibilityReason;
  }
  if (input.sourceBusy) return SOURCE_LOADING_REASON;
  if (input.editorBlockedReason !== undefined) return input.editorBlockedReason;
  if (input.workingMediaBusy) return WORKING_MEDIA_BUSY_REASON;
  return null;
};

/** The three edits, in the order a Project usually reaches for them. */
export const projectCreateLaunchers = (
  input: ProjectCreateLauncherInput,
): readonly ProjectCreateLauncher[] => [
  {
    id: 'character-swap',
    title: VIDEO_TRANSFORM_OPERATION_LABELS['character-swap'],
    description: VIDEO_TRANSFORM_OPERATION_DESCRIPTIONS['character-swap'],
    input: {
      kind: 'character',
      label: 'Character',
      value: characterValue(input.snapshot),
    },
    cost: PROJECT_PROCESSING_START_COST_NOTE,
    actionLabel: `Open ${VIDEO_TRANSFORM_OPERATION_LABELS['character-swap']}`,
    blockedReason: launcherBlockedReason('character-swap', input),
  },
  {
    id: 'virtual-try-on',
    title: VIDEO_TRANSFORM_OPERATION_LABELS['virtual-try-on'],
    description: VIDEO_TRANSFORM_OPERATION_DESCRIPTIONS['virtual-try-on'],
    input: {
      kind: 'outfit',
      label: 'Outfit',
      value: input.snapshot.selectedOutfit?.outfitLabel ?? null,
    },
    cost: PROJECT_PROCESSING_START_COST_NOTE,
    actionLabel: `Open ${VIDEO_TRANSFORM_OPERATION_LABELS['virtual-try-on']}`,
    blockedReason: launcherBlockedReason('virtual-try-on', input),
  },
  {
    id: 'adjust',
    title: 'Edit video',
    description: 'Trim, crop, rotate and colour-correct on this device.',
    input: null,
    cost: null,
    actionLabel: 'Open the video editor',
    blockedReason: launcherBlockedReason('adjust', input),
  },
];

/** Which adoption a current-cut notice is reporting on. */
export type ProjectCurrentCutOrigin = 'saved-version' | 'local-render';

export type ProjectCurrentCutPhase = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

export interface ProjectCurrentCutNotice {
  readonly title: string;
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger';
  readonly role: 'alert' | 'status';
}

const CURRENT_CUT_TITLES: Record<
  ProjectCurrentCutOrigin,
  Record<ProjectCurrentCutPhase, string>
> = {
  'saved-version': {
    idle: 'Current cut updated',
    saving: 'Using that saved version',
    saved: 'Current cut updated',
    conflict: 'Saved version needs a retry',
    error: 'Saved version not used',
  },
  'local-render': {
    idle: 'Edit is now the current cut',
    saving: 'Using your edit',
    saved: 'Edit is now the current cut',
    conflict: 'Edit needs a retry',
    error: 'Edit not used',
  },
};

const CURRENT_CUT_TONES: Record<
  ProjectCurrentCutPhase,
  { readonly tone: ProjectCurrentCutNotice['tone']; readonly role: ProjectCurrentCutNotice['role'] }
> = {
  idle: { tone: 'success', role: 'status' },
  saving: { tone: 'neutral', role: 'status' },
  saved: { tone: 'success', role: 'status' },
  conflict: { tone: 'warning', role: 'alert' },
  error: { tone: 'danger', role: 'alert' },
};

/**
 * One vocabulary for both adoptions, discriminated by where the media came from.
 *
 * Adopting a saved Version and adopting a local render are two different operations that used to
 * wear one set of titles, and the Create task can show both at once — so a reader could not tell
 * which of the two had just happened. Every phase now reads differently per origin.
 */
export const projectCurrentCutNotice = (
  origin: ProjectCurrentCutOrigin,
  phase: ProjectCurrentCutPhase,
): ProjectCurrentCutNotice => ({
  title: CURRENT_CUT_TITLES[origin][phase],
  ...CURRENT_CUT_TONES[phase],
});
