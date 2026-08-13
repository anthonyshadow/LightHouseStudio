import {
  projectSessionProposalSchema,
  type ProjectCurrentResponse,
  type ProjectSessionProposalContract,
} from '@studio/contracts';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { ProjectApiConflictError } from './projectsApi';

export const PROJECT_SESSION_AUTOSAVE_MS = 750;

export type ProjectSessionPhase = 'hydrating' | 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

export interface ProjectSessionSnapshot {
  readonly projectId: string;
  readonly phase: ProjectSessionPhase;
  readonly current: ProjectCurrentResponse | null;
  readonly proposal: ProjectSessionProposalContract | null;
  readonly hasLocalProposal: boolean;
  readonly message: string | null;
}

export interface ProjectSessionDependencies {
  readonly load: (projectId: string, signal: AbortSignal) => Promise<ProjectCurrentResponse>;
  readonly save: (
    projectId: string,
    current: ProjectCurrentResponse,
    proposal: ProjectSessionProposalContract,
    signal: AbortSignal,
  ) => Promise<ProjectCurrentResponse>;
  readonly publish?: (current: ProjectCurrentResponse) => void;
  readonly autosaveMs?: number;
}

const proposalFromCurrent = (current: ProjectCurrentResponse): ProjectSessionProposalContract => ({
  workflowPhase: current.revision.snapshot.workflowPhase,
  liveMode: current.revision.snapshot.liveMode,
});

const proposalsMatch = (
  left: ProjectSessionProposalContract,
  right: ProjectSessionProposalContract,
): boolean =>
  left.workflowPhase === right.workflowPhase &&
  JSON.stringify(left.liveMode) === JSON.stringify(right.liveMode);

const safeSessionMessage = (error: unknown): string => {
  if (error instanceof ProjectApiConflictError) {
    return 'This Project changed in another session. Your local proposal was preserved.';
  }
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Project saving was cancelled.';
  }
  return 'Lightframe could not reach Project authority. Your local proposal was preserved.';
};

export class ProjectSessionController {
  readonly #listeners = new Set<() => void>();
  readonly #autosaveMs: number;
  #snapshot: ProjectSessionSnapshot;
  #desired: ProjectSessionProposalContract | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #hydratePromise: Promise<boolean> | null = null;
  #savePromise: Promise<boolean> | null = null;
  #controller: AbortController | null = null;
  #disposed = false;

  constructor(
    readonly projectId: string,
    readonly dependencies: ProjectSessionDependencies,
  ) {
    this.#autosaveMs = dependencies.autosaveMs ?? PROJECT_SESSION_AUTOSAVE_MS;
    this.#snapshot = {
      projectId,
      phase: 'hydrating',
      current: null,
      proposal: null,
      hasLocalProposal: false,
      message: null,
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): ProjectSessionSnapshot => this.#snapshot;

  readonly hydrate = async (): Promise<boolean> => {
    if (this.#hydratePromise !== null) return this.#hydratePromise;
    this.#hydratePromise = this.#loadAuthority();
    try {
      return await this.#hydratePromise;
    } finally {
      this.#hydratePromise = null;
    }
  };

  readonly propose = (proposal: Partial<ProjectSessionProposalContract>): boolean => {
    const current = this.#snapshot.current;
    if (current === null || this.#disposed) return false;
    const desired = projectSessionProposalSchema.parse({
      ...(this.#desired ?? proposalFromCurrent(current)),
      ...proposal,
    });
    this.#desired = desired;
    if (!this.#hasLocalProposal()) {
      this.#clearTimer();
      if (this.#savePromise === null) this.#update({ phase: 'saved', message: null });
      return true;
    }
    if (this.#snapshot.phase !== 'saving') {
      this.#update({ phase: 'dirty', message: null });
      this.#scheduleAutosave();
    } else {
      this.#update({});
    }
    return true;
  };

  readonly flush = async (): Promise<boolean> => {
    this.#clearTimer();
    if (this.#snapshot.current === null && !(await this.hydrate())) return false;
    if (this.#savePromise !== null) await this.#savePromise;
    if (!this.#hasLocalProposal()) return this.#snapshot.current !== null;
    if (this.#snapshot.phase === 'conflict' || this.#snapshot.phase === 'error') return false;
    return this.#startSave(true);
  };

  readonly retry = async (): Promise<boolean> => {
    if (!this.#hasLocalProposal()) return this.hydrate();
    if (!(await this.#reloadAuthorityPreservingProposal())) return false;
    if (!this.#hasLocalProposal()) return true;
    this.#update({ phase: 'dirty', message: null });
    return this.#startSave(true);
  };

  readonly discard = (): boolean => {
    if (this.#savePromise !== null) return false;
    this.#clearTimer();
    const current = this.#snapshot.current;
    this.#desired = current === null ? null : proposalFromCurrent(current);
    this.#update({ phase: current === null ? 'hydrating' : 'saved', message: null });
    return true;
  };

  readonly acceptCurrent = (current: ProjectCurrentResponse): void => {
    if (current.project.id !== this.projectId || this.#disposed) return;
    const preserveProposal = this.#hasLocalProposal() || this.#savePromise !== null;
    this.#acceptAuthority(current, preserveProposal);
    if (this.#hasLocalProposal() && this.#snapshot.phase !== 'saving') {
      this.#update({ phase: 'dirty', message: null });
      this.#scheduleAutosave();
    } else if (this.#savePromise === null) {
      this.#update({ phase: 'saved', message: null });
    }
  };

  readonly dispose = (): void => {
    this.#disposed = true;
    this.#clearTimer();
    this.#controller?.abort('project-session-disposed');
    this.#controller = null;
    this.#listeners.clear();
  };

  async #loadAuthority(): Promise<boolean> {
    this.#controller?.abort('project-session-reloading');
    const controller = new AbortController();
    this.#controller = controller;
    this.#update({ phase: 'hydrating', message: null });
    try {
      const current = await this.dependencies.load(this.projectId, controller.signal);
      if (controller.signal.aborted || this.#disposed) return false;
      this.#acceptLoadedAuthority(current, this.#hasLocalProposal());
      if (this.#hasLocalProposal()) this.#scheduleAutosave();
      return true;
    } catch (error) {
      if (controller.signal.aborted || this.#disposed) return false;
      this.#update({ phase: 'error', message: safeSessionMessage(error) });
      return false;
    } finally {
      if (this.#controller === controller) this.#controller = null;
    }
  }

  async #reloadAuthorityPreservingProposal(): Promise<boolean> {
    const controller = new AbortController();
    this.#controller?.abort('project-session-reloading');
    this.#controller = controller;
    try {
      const current = await this.dependencies.load(this.projectId, controller.signal);
      if (controller.signal.aborted || this.#disposed) return false;
      this.#acceptLoadedAuthority(current, true);
      return true;
    } catch (error) {
      if (controller.signal.aborted || this.#disposed) return false;
      this.#update({ phase: 'error', message: safeSessionMessage(error) });
      return false;
    } finally {
      if (this.#controller === controller) this.#controller = null;
    }
  }

  async #startSave(flushAll: boolean): Promise<boolean> {
    if (this.#savePromise !== null) {
      await this.#savePromise;
      const hasLocalProposal = this.#hasLocalProposal();
      if (flushAll && hasLocalProposal) return this.#startSave(true);
      return !hasLocalProposal;
    }
    const operation = this.#drain(flushAll);
    this.#savePromise = operation;
    try {
      return await operation;
    } finally {
      if (this.#savePromise === operation) this.#savePromise = null;
    }
  }

  async #drain(flushAll: boolean): Promise<boolean> {
    const maximumAttempts = flushAll ? 4 : 1;
    let attempts = 0;
    while (this.#hasLocalProposal() && attempts < maximumAttempts) {
      attempts += 1;
      if (!(await this.#saveOnce())) return false;
    }
    if (!this.#hasLocalProposal()) {
      this.#update({ phase: 'saved', message: null });
      return true;
    }
    this.#update({ phase: 'dirty', message: null });
    this.#scheduleAutosave();
    return false;
  }

  async #saveOnce(): Promise<boolean> {
    const current = this.#snapshot.current;
    const target = this.#desired;
    if (current === null || target === null || !this.#hasLocalProposal()) return true;
    const controller = new AbortController();
    this.#controller?.abort('project-session-saving');
    this.#controller = controller;
    this.#update({ phase: 'saving', message: null });
    try {
      const saved = await this.dependencies.save(
        this.projectId,
        current,
        target,
        controller.signal,
      );
      if (controller.signal.aborted || this.#disposed) return false;
      this.#acceptAuthority(saved, true);
      return true;
    } catch (error) {
      if (controller.signal.aborted || this.#disposed) return false;
      try {
        const latest = await this.dependencies.load(this.projectId, controller.signal);
        if (controller.signal.aborted || this.#disposed) return false;
        this.#acceptAuthority(latest, true);
        if (proposalsMatch(proposalFromCurrent(latest), target)) return true;
      } catch {
        if (controller.signal.aborted || this.#disposed) return false;
      }
      this.#update({
        phase: error instanceof ProjectApiConflictError ? 'conflict' : 'error',
        message: safeSessionMessage(error),
      });
      return false;
    } finally {
      if (this.#controller === controller) this.#controller = null;
    }
  }

  #acceptAuthority(current: ProjectCurrentResponse, preserveProposal: boolean): void {
    this.#snapshot = { ...this.#snapshot, current };
    if (!preserveProposal || this.#desired === null) this.#desired = proposalFromCurrent(current);
    this.dependencies.publish?.(current);
    this.#update({});
  }

  #acceptLoadedAuthority(current: ProjectCurrentResponse, preserveProposal: boolean): void {
    this.#acceptAuthority(current, preserveProposal);
    this.#update({
      phase: this.#hasLocalProposal() ? 'dirty' : 'saved',
      message: null,
    });
  }

  #hasLocalProposal(): boolean {
    const current = this.#snapshot.current;
    return (
      current !== null &&
      this.#desired !== null &&
      !proposalsMatch(proposalFromCurrent(current), this.#desired)
    );
  }

  #scheduleAutosave(): void {
    if (this.#timer !== null || this.#disposed) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#startSave(false);
    }, this.#autosaveMs);
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #update(patch: Partial<Pick<ProjectSessionSnapshot, 'phase' | 'message'>>): void {
    const hasLocalProposal = this.#hasLocalProposal();
    this.#snapshot = {
      ...this.#snapshot,
      ...patch,
      proposal: hasLocalProposal ? this.#desired : null,
      hasLocalProposal,
    };
    for (const listener of this.#listeners) listener();
  }
}
