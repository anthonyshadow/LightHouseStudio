import type { RecipeSelection } from '../../features/creative-assets/RecipeShelf.types';

/**
 * A creative selection made outside the Studio, on its way in.
 *
 * Asset libraries live on `/assets/*`, which owns no capture graph, so "Use in Studio" has nothing
 * to apply to at the moment it is clicked. Every one of these is followed immediately by a
 * navigation to Studio, so a handoff has to survive exactly one route change and no more.
 *
 * Router state was the obvious alternative and is the wrong one: history entries persist, so
 * Back-then-Forward would re-apply a selection the operator already moved on from — the codebase
 * already carries a compensating `navigate(..., { state: null })` to undo exactly that for the
 * upload intent. A module-scoped store was the other, and it outlives both logout and the test
 * harness's cleanup.
 *
 * This module must stay a leaf: the shell reaches the runtime through a dynamic import, which
 * `check-module-graph.mjs` counts as an edge, so anything imported back from here would be a cycle.
 */
export type StudioHandoff =
  | Readonly<{ kind: 'use-recipe'; selection: RecipeSelection }>
  | Readonly<{ kind: 'preselect-voice'; voiceId: string; voiceName: string }>;

/**
 * What the Studio runtime exposes to the surfaces that outlive it.
 *
 * Absent means "no runtime is mounted", which is a normal state rather than an error: a Character
 * saved from a Project route has a Project destination and never touches a session.
 */
export interface StudioRuntimePorts {
  /** Applies a creative selection to the live session draft. */
  readonly applyRecipe: (selection: RecipeSelection) => void;
  /** Holds a Voice until a source video exists, or applies it if one already does. */
  readonly selectVoice: (voiceId: string, voiceName: string) => void;
}
