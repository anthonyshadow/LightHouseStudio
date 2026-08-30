/**
 * The phases a Project's processing controller moves through, and what each one means to whoever
 * is watching.
 *
 * A leaf module of its own, because classifying a phase must not cost the controller. The
 * controller reaches the API client and the query layer; a surface that only needs to ask "is a run
 * happening" would drag all of that into its own chunk, and on the Studio side that is a closure
 * `check:build-manifest` holds to a budget. Types cross that edge for free — values do not.
 */

export type ProjectProcessingCommandPhase =
  | 'idle'
  | 'loading'
  | 'preparing'
  | 'submitting'
  | 'retrying'
  | 'cancelling'
  | 'refreshing'
  | 'error';

/**
 * `command` is a request the operator started — the window a submission occupies before there is an
 * accepted attempt to poll. `read` is asking the server what it already holds: free, it submits
 * nothing and owns nothing. `settled` is neither.
 *
 * One total table rather than a list per answer, so a ninth phase is a compile error here instead
 * of a phase that belongs to no answer and silently stops every surface keyed on these.
 */
const PHASE_ACTIVITY = {
  idle: 'settled',
  loading: 'read',
  preparing: 'command',
  submitting: 'command',
  retrying: 'command',
  cancelling: 'command',
  refreshing: 'read',
  error: 'settled',
} as const satisfies Record<ProjectProcessingCommandPhase, 'command' | 'read' | 'settled'>;

/**
 * Whether a command the operator started is still in flight.
 *
 * Deliberately narrower than `projectProcessingBusy`, which also counts a read: `loading` is the
 * phase the controller enters on mount and on every revision change, and `refreshing` is what the
 * check-status controls set themselves, so a surface that blocks on busy blocks for work that
 * submits nothing.
 */
export const projectProcessingCommandInFlight = (phase: ProjectProcessingCommandPhase): boolean =>
  PHASE_ACTIVITY[phase] === 'command';

/** Whether a request of any kind is outstanding — a command or a read. */
export const projectProcessingBusy = (phase: ProjectProcessingCommandPhase): boolean =>
  PHASE_ACTIVITY[phase] !== 'settled';
