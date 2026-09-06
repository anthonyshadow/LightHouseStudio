import { errorClassOf } from '../../http/errors.js';
import {
  AI_USAGE_RECONCILE_BATCH,
  RECONCILIATION_FAILED,
  type AiUsageReconciler,
} from '../ai-usage/ai-usage-reconciler.js';
import type { ProjectProcessingService } from '../projects/project-processing-service.js';
import type { VideoJobProgressionResult, VideoJobService } from './video-job-service.js';

/**
 * The sweep runs on its own clock rather than the tick's, because the two answer different
 * questions: a job moves in seconds, while a row only goes unclosed when a process died or a store
 * refused a write.
 */
const LEDGER_RECONCILE_INTERVAL_MS = 60_000;

/** A refused retention is worth retrying, but never faster than the operator would notice. */
const MAXIMUM_RETENTION_BACKOFF_MS = 5 * 60 * 1_000;

const PROGRESSION_FAILED = '[video-job-progression] Progression pass failed.';
const RETENTION_FAILED = '[video-job-progression] Project result retention failed.';
const PASS_COMPLETED = '[video-job-progression] Progression pass.';

/** Cancelling is all the runner ever asks of its schedule; one interval lives for one runner. */
export interface ScheduledVideoJobProgression {
  cancel(): void;
}

/**
 * What the runner says about itself: counts on the happy path, ids and an error class when
 * something failed. Never a provider body, a prompt or a store's own message. A pino child logger
 * satisfies it directly, which is how it is wired in the application.
 */
export interface VideoJobProgressionLog {
  info(details: Record<string, number>, message: string): void;
  warn(details: Record<string, string>, message: string): void;
}

/** The job service seen through the two members a pass uses, so a test can stand in for it. */
type ProgressableVideoJobs = Pick<VideoJobService, 'available' | 'progressDueJobs'>;

/** Retention only. The tick must never be able to promote a result nobody asked for. */
type ProjectResultRetention = Pick<ProjectProcessingService, 'retainResultBytes'>;

type LedgerReconciliation = Pick<AiUsageReconciler, 'reconcile'>;

export interface VideoJobProgressionTickOptions {
  readonly videoJobs: ProgressableVideoJobs;
  /** Absent when this deployment has no Project persistence: then a pass only polls. */
  readonly projectProcessing?: ProjectResultRetention;
  /** Absent when nothing durable can be read back, so no sweep could reach an answer. */
  readonly reconciler?: LedgerReconciliation;
  readonly intervalMs: number;
  readonly maxProviderPolls: number;
  readonly schedule?: (callback: () => void, intervalMs: number) => ScheduledVideoJobProgression;
  readonly now?: () => number;
  readonly log: VideoJobProgressionLog;
}

const scheduleSystemInterval = (
  callback: () => void,
  intervalMs: number,
): ScheduledVideoJobProgression => {
  const timer = setInterval(callback, intervalMs);
  // Unattended work must never be the reason the process stays alive.
  timer.unref?.();
  return { cancel: () => clearInterval(timer) };
};

const NOTHING_PROGRESSED: VideoJobProgressionResult = {
  polled: 0,
  retrievalsStarted: 0,
  readyTruncated: false,
  readyProjectLinked: [],
};

/**
 * Moves accepted jobs along, and lands what they produced, with no client watching.
 *
 * The runner owns the interval and the composition; it owns no job state of its own. Each pass asks
 * the job service to poll what is due, retains the Project results that became ready, and — far
 * less often — asks the reconciler to close usage rows whose jobs settled without anyone present.
 * Retention is deliberately retention only: adopting a result as the Project's current cut is a
 * decision the operator makes on their next visit, not one a timer makes for them.
 *
 * A pass never rejects. This work is unattended, so a fault has to become a log line rather than an
 * unhandled rejection nobody will read, and one broken step must not cost the other two their pass.
 */
export class VideoJobProgressionTick {
  readonly #videoJobs: ProgressableVideoJobs;
  readonly #projectProcessing: ProjectResultRetention | undefined;
  readonly #reconciler: LedgerReconciliation | undefined;
  readonly #intervalMs: number;
  readonly #maxProviderPolls: number;
  readonly #now: () => number;
  readonly #log: VideoJobProgressionLog;
  readonly #scheduled: ScheduledVideoJobProgression;
  /** Per job: how many retentions in a row it has refused, and when it may be tried again. */
  readonly #retentionBackoff = new Map<
    string,
    { readonly attempts: number; readonly nextAttemptAtMs: number }
  >();
  #inFlight: Promise<void> | null = null;
  #skippedOverlap = 0;
  #lastReconciledAtMs: number | null = null;
  #closed = false;

  constructor(options: VideoJobProgressionTickOptions) {
    this.#videoJobs = options.videoJobs;
    this.#projectProcessing = options.projectProcessing;
    this.#reconciler = options.reconciler;
    this.#intervalMs = options.intervalMs;
    this.#maxProviderPolls = options.maxProviderPolls;
    this.#now = options.now ?? Date.now;
    this.#log = options.log;
    this.#scheduled = (options.schedule ?? scheduleSystemInterval)(() => {
      void this.run().catch(() => undefined);
    }, options.intervalMs);
  }

  /**
   * One pass, or the pass already running.
   *
   * A slow pass must not stack another on top of itself: a provider read that takes longer than the
   * interval would otherwise double the traffic exactly when the provider is least able to serve it.
   * The caller joins the work in flight instead, and the skip is counted so the log can say the
   * interval is too short for what this deployment is doing.
   */
  run(): Promise<void> {
    const inFlight = this.#inFlight;
    if (inFlight !== null) {
      this.#skippedOverlap += 1;
      return inFlight;
    }
    if (this.#closed || !this.#videoJobs.available) return Promise.resolve();
    const pass = this.#pass().finally(() => {
      this.#inFlight = null;
    });
    this.#inFlight = pass;
    return pass;
  }

  /** Stops the interval and waits for the pass in flight, so nothing outlives the application. */
  async close(): Promise<void> {
    this.#closed = true;
    this.#scheduled.cancel();
    await this.#inFlight;
  }

  async #pass(): Promise<void> {
    const startedAtMs = this.#now();
    let progression = NOTHING_PROGRESSED;
    try {
      progression = await this.#videoJobs.progressDueJobs({
        maxProviderPolls: this.#maxProviderPolls,
      });
    } catch (error) {
      // The sweep below reads a different store and answers a different question; it keeps its pass.
      this.#log.warn({ errorClass: errorClassOf(error) }, PROGRESSION_FAILED);
    }
    const retained = await this.#retain(progression);
    const ledgerReconciled = await this.#reconcileLedger();
    const skippedOverlap = this.#skippedOverlap;
    this.#skippedOverlap = 0;
    if (
      progression.polled === 0 &&
      retained === 0 &&
      ledgerReconciled === 0 &&
      skippedOverlap === 0
    ) {
      // An idle deployment is the normal case. It must not fill the log with proof of its idleness.
      return;
    }
    this.#log.info(
      {
        polled: progression.polled,
        retrievalsStarted: progression.retrievalsStarted,
        retained,
        retentionBackoffs: this.#retentionBackoff.size,
        ledgerReconciled,
        skippedOverlap,
        elapsedMs: this.#now() - startedAtMs,
      },
      PASS_COMPLETED,
    );
  }

  /**
   * Puts the results that became ready where they survive, and remembers what refused.
   *
   * Concurrency here is the same shape as several browser tabs reconciling at once: the Project
   * service serializes per owner and operation, and a second entrant finds the bytes already
   * stored. What a client cannot do is refuse forever unnoticed, so a job that keeps failing —
   * a Project that moved under it, a byte store that will not take the file — is held back for
   * growing intervals instead of costing a lock acquisition every pass for the rest of its hour.
   */
  async #retain(progression: VideoJobProgressionResult): Promise<number> {
    const ready = progression.readyProjectLinked;
    /*
     * A job absent from this pass has landed or expired, and a record of its past refusals should
     * not outlive it. Except when the pass was cut short by its own bound: an absence then can also
     * mean the job simply did not fit, and forgetting a refusal for that reason would hand a job
     * that cannot land a fresh full-rate retry every pass, which is what the backoff exists to
     * stop. A truncated pass forgets nothing; the next complete one does the pruning.
     */
    if (!progression.readyTruncated) {
      const stillReady = new Set(ready.map((entry) => entry.jobId));
      for (const jobId of [...this.#retentionBackoff.keys()]) {
        if (!stillReady.has(jobId)) this.#retentionBackoff.delete(jobId);
      }
    }
    const projectProcessing = this.#projectProcessing;
    if (projectProcessing === undefined) return 0;
    const now = this.#now();
    const due = ready.filter(
      (entry) => (this.#retentionBackoff.get(entry.jobId)?.nextAttemptAtMs ?? 0) <= now,
    );
    // Started together, then read as results rather than re-awaited: `allSettled` is what keeps a
    // refusal from reaching the process as an unhandled rejection, and it answers one result per
    // input in input order, which is what lets each answer name the job it belongs to.
    const settled = await Promise.allSettled(
      due.map((entry) =>
        projectProcessing.retainResultBytes(entry.ownerId, entry.projectId, entry.jobId),
      ),
    );

    let retained = 0;
    for (const [index, result] of settled.entries()) {
      const entry = due[index];
      // One result per attempt, so this only narrows the index rather than skipping anything.
      if (entry === undefined) continue;
      if (result.status === 'fulfilled') {
        this.#retentionBackoff.delete(entry.jobId);
        retained += 1;
        continue;
      }
      const failures = (this.#retentionBackoff.get(entry.jobId)?.attempts ?? 0) + 1;
      this.#retentionBackoff.set(entry.jobId, {
        attempts: failures,
        // The first refusal already costs a whole pass: a job that cannot land should stop
        // competing with the ones that can immediately, not after several more attempts.
        nextAttemptAtMs:
          this.#now() + Math.min(this.#intervalMs * 2 ** failures, MAXIMUM_RETENTION_BACKOFF_MS),
      });
      this.#log.warn(
        { jobId: entry.jobId, projectId: entry.projectId, errorClass: errorClassOf(result.reason) },
        RETENTION_FAILED,
      );
    }
    return retained;
  }

  /** At most one bounded sweep a minute, whatever the interval the tick itself runs at. */
  async #reconcileLedger(): Promise<number> {
    const reconciler = this.#reconciler;
    if (reconciler === undefined) return 0;
    const now = this.#now();
    if (
      this.#lastReconciledAtMs !== null &&
      now - this.#lastReconciledAtMs < LEDGER_RECONCILE_INTERVAL_MS
    ) {
      return 0;
    }
    // Stamped before the sweep, so one that cannot run is not retried on every pass either.
    this.#lastReconciledAtMs = now;
    try {
      return await reconciler.reconcile(now, AI_USAGE_RECONCILE_BATCH);
    } catch (error) {
      this.#log.warn({ errorClass: errorClassOf(error) }, RECONCILIATION_FAILED);
      return 0;
    }
  }
}
