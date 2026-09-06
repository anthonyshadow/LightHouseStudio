import { describe, expect, it, vi } from 'vitest';
import { AI_USAGE_RECONCILE_BATCH } from '../ai-usage/ai-usage-reconciler.js';
import type { ProjectProcessingService } from '../projects/project-processing-service.js';
import {
  VideoJobProgressionTick,
  type ScheduledVideoJobProgression,
  type VideoJobProgressionLog,
} from './video-job-progression.js';
import type { VideoJobProgressionResult } from './video-job-service.js';

const OWNER = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const PROJECT = '0f0f2a2d-2f4b-4d1a-9a1e-9b1c2d3e4f50';
const JOB = '720620f6-446b-4987-828e-bc23470e613d';
const INTERVAL_MS = 5_000;

const PASS_COMPLETED = '[video-job-progression] Progression pass.';
const RETENTION_FAILED = '[video-job-progression] Project result retention failed.';
const PROGRESSION_FAILED = '[video-job-progression] Progression pass failed.';

const nothing: VideoJobProgressionResult = {
  polled: 0,
  retrievalsStarted: 0,
  readyProjectLinked: [],
};

const readyEntry = { jobId: JOB, ownerId: OWNER, projectId: PROJECT };

/**
 * A clock the test moves by hand and a schedule that keeps its callback instead of arming a timer.
 * Every pass below is one explicit call, so nothing here waits on real time.
 */
class ManualProgressionSchedule {
  nowMs = Date.parse('2026-09-06T09:00:00.000Z');
  cancelled = 0;
  #callback: (() => void) | null = null;

  readonly now = (): number => this.nowMs;

  readonly schedule = (callback: () => void): ScheduledVideoJobProgression => {
    this.#callback = callback;
    return {
      cancel: () => {
        this.cancelled += 1;
        this.#callback = null;
      },
    };
  };

  /** What the armed interval would have done, for the cases that go through it. */
  fire(): void {
    if (this.#callback === null) throw new Error('The schedule is not armed.');
    this.#callback();
  }
}

const recordingLog = (): {
  readonly info: ReturnType<typeof vi.fn<VideoJobProgressionLog['info']>>;
  readonly warn: ReturnType<typeof vi.fn<VideoJobProgressionLog['warn']>>;
} => ({
  info: vi.fn<VideoJobProgressionLog['info']>(),
  warn: vi.fn<VideoJobProgressionLog['warn']>(),
});

const retention = () => vi.fn<ProjectProcessingService['retainResultBytes']>();

/** The details last logged under one message, so an assertion names the line it means. */
const lastLine = <Details>(
  calls: readonly (readonly [Details, string])[],
  message: string,
): Details | undefined => {
  for (const call of [...calls].reverse()) {
    if (call[1] === message) return call[0];
  }
  return undefined;
};

describe('VideoJobProgressionTick', () => {
  it('joins the pass already in flight instead of starting a second one', async () => {
    const schedule = new ManualProgressionSchedule();
    const log = recordingLog();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const progressDueJobs = vi.fn(async (): Promise<VideoJobProgressionResult> => {
      await held;
      return { polled: 2, retrievalsStarted: 1, readyProjectLinked: [] };
    });
    const tick = new VideoJobProgressionTick({
      videoJobs: { available: true, progressDueJobs },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log,
    });

    const first = tick.run();
    const second = tick.run();
    expect(second).toBe(first);
    release();
    await Promise.all([first, second]);

    expect(progressDueJobs).toHaveBeenCalledTimes(1);
    expect(progressDueJobs).toHaveBeenCalledWith({ maxProviderPolls: 4 });
    expect(lastLine(log.info.mock.calls, PASS_COMPLETED)).toMatchObject({
      polled: 2,
      retrievalsStarted: 1,
      skippedOverlap: 1,
    });

    // The next pass starts clean: the overlap belonged to the pass it was skipped for.
    await tick.run();
    expect(progressDueJobs).toHaveBeenCalledTimes(2);
    expect(lastLine(log.info.mock.calls, PASS_COMPLETED)).toMatchObject({ skippedOverlap: 0 });
    await tick.close();
  });

  it('sweeps the ledger on the first pass and then only once a minute', async () => {
    const schedule = new ManualProgressionSchedule();
    const reconcile = vi.fn(() => Promise.resolve(0));
    const tick = new VideoJobProgressionTick({
      videoJobs: { available: true, progressDueJobs: () => Promise.resolve(nothing) },
      reconciler: { reconcile },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log: recordingLog(),
    });

    await tick.run();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(schedule.nowMs, AI_USAGE_RECONCILE_BATCH);

    // Eleven further passes at the five-second default all fall inside the same minute.
    for (let pass = 1; pass < 12; pass += 1) {
      schedule.nowMs += INTERVAL_MS;
      await tick.run();
    }
    expect(reconcile).toHaveBeenCalledTimes(1);

    schedule.nowMs += INTERVAL_MS;
    await tick.run();
    expect(reconcile).toHaveBeenCalledTimes(2);
    await tick.close();
  });

  it('sweeps the ledger on every pass when the tick itself is slower than a minute', async () => {
    const schedule = new ManualProgressionSchedule();
    const reconcile = vi.fn(() => Promise.resolve(0));
    const tick = new VideoJobProgressionTick({
      videoJobs: { available: true, progressDueJobs: () => Promise.resolve(nothing) },
      reconciler: { reconcile },
      intervalMs: 90_000,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log: recordingLog(),
    });

    await tick.run();
    schedule.nowMs += 90_000;
    await tick.run();
    schedule.nowMs += 90_000;
    await tick.run();

    expect(reconcile).toHaveBeenCalledTimes(3);
    await tick.close();
  });

  it('retains a ready Project result with no client present', async () => {
    const schedule = new ManualProgressionSchedule();
    const log = recordingLog();
    const retainResultBytes = retention().mockResolvedValue(undefined);
    const tick = new VideoJobProgressionTick({
      videoJobs: {
        available: true,
        progressDueJobs: () =>
          Promise.resolve({ polled: 1, retrievalsStarted: 1, readyProjectLinked: [readyEntry] }),
      },
      projectProcessing: { retainResultBytes },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log,
    });

    await tick.run();

    // Owner, Project, operation: the same call a Project reconcile makes for a browser that is
    // open, and nothing beyond it — the result is stored, never adopted.
    expect(retainResultBytes).toHaveBeenCalledWith(OWNER, PROJECT, JOB);
    expect(lastLine(log.info.mock.calls, PASS_COMPLETED)).toMatchObject({
      retained: 1,
      retentionBackoffs: 0,
    });
    await tick.close();
  });

  it('holds a refused retention back for a growing interval and forgets it once it lands', async () => {
    const schedule = new ManualProgressionSchedule();
    const log = recordingLog();
    const retainResultBytes = retention()
      .mockRejectedValueOnce(new TypeError('the Project moved'))
      .mockRejectedValueOnce(new TypeError('the Project moved'))
      .mockResolvedValue(undefined);
    const tick = new VideoJobProgressionTick({
      videoJobs: {
        available: true,
        progressDueJobs: () =>
          Promise.resolve({ polled: 1, retrievalsStarted: 0, readyProjectLinked: [readyEntry] }),
      },
      projectProcessing: { retainResultBytes },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log,
    });

    await tick.run();
    expect(retainResultBytes).toHaveBeenCalledTimes(1);
    expect(lastLine(log.warn.mock.calls, RETENTION_FAILED)).toEqual({
      jobId: JOB,
      projectId: PROJECT,
      errorClass: 'TypeError',
    });
    expect(lastLine(log.info.mock.calls, PASS_COMPLETED)).toMatchObject({
      retained: 0,
      retentionBackoffs: 1,
    });

    // One refusal already costs a pass, so the next one does not even take the lock.
    schedule.nowMs += INTERVAL_MS;
    await tick.run();
    expect(retainResultBytes).toHaveBeenCalledTimes(1);

    schedule.nowMs += INTERVAL_MS;
    await tick.run();
    expect(retainResultBytes).toHaveBeenCalledTimes(2);

    // The second refusal doubles the wait, so the pass halfway through it is skipped too.
    schedule.nowMs += INTERVAL_MS * 2;
    await tick.run();
    expect(retainResultBytes).toHaveBeenCalledTimes(2);

    schedule.nowMs += INTERVAL_MS * 2;
    await tick.run();
    expect(retainResultBytes).toHaveBeenCalledTimes(3);
    expect(lastLine(log.info.mock.calls, PASS_COMPLETED)).toMatchObject({
      retained: 1,
      retentionBackoffs: 0,
    });
    await tick.close();
  });

  it('forgets a job that leaves the ready set, so its history cannot outlive it', async () => {
    const schedule = new ManualProgressionSchedule();
    const retainResultBytes = retention()
      .mockRejectedValueOnce(new TypeError('the Project moved'))
      .mockResolvedValue(undefined);
    let ready: VideoJobProgressionResult['readyProjectLinked'] = [readyEntry];
    const tick = new VideoJobProgressionTick({
      videoJobs: {
        available: true,
        progressDueJobs: () =>
          Promise.resolve({ polled: 1, retrievalsStarted: 0, readyProjectLinked: ready }),
      },
      projectProcessing: { retainResultBytes },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log: recordingLog(),
    });

    await tick.run();
    expect(retainResultBytes).toHaveBeenCalledTimes(1);

    ready = [];
    schedule.nowMs += INTERVAL_MS;
    await tick.run();

    // Back in the set while its backoff window would still have been open, and tried at once: the
    // job that returns is a different attempt at the same id, not the one that was refused.
    ready = [readyEntry];
    await tick.run();
    expect(retainResultBytes).toHaveBeenCalledTimes(2);
    await tick.close();
  });

  it('says nothing when a pass had nothing to do', async () => {
    const schedule = new ManualProgressionSchedule();
    const log = recordingLog();
    const idle = new VideoJobProgressionTick({
      videoJobs: { available: true, progressDueJobs: () => Promise.resolve(nothing) },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log,
    });

    await idle.run();
    expect(log.info).not.toHaveBeenCalled();

    const busy = new VideoJobProgressionTick({
      videoJobs: {
        available: true,
        progressDueJobs: () =>
          Promise.resolve({ polled: 3, retrievalsStarted: 1, readyProjectLinked: [] }),
      },
      reconciler: { reconcile: () => Promise.resolve(2) },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log,
    });
    await busy.run();

    expect(log.info).toHaveBeenCalledTimes(1);
    expect(lastLine(log.info.mock.calls, PASS_COMPLETED)).toEqual({
      polled: 3,
      retrievalsStarted: 1,
      retained: 0,
      retentionBackoffs: 0,
      ledgerReconciled: 2,
      skippedOverlap: 0,
      elapsedMs: 0,
    });
    await idle.close();
    await busy.close();
  });

  it('keeps the ledger sweep when polling fails, and never rejects a pass', async () => {
    const schedule = new ManualProgressionSchedule();
    const log = recordingLog();
    const reconcile = vi.fn(() => Promise.resolve(1));
    const tick = new VideoJobProgressionTick({
      videoJobs: {
        available: true,
        progressDueJobs: () => Promise.reject(new TypeError('the job map is gone')),
      },
      reconciler: { reconcile },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log,
    });

    await expect(tick.run()).resolves.toBeUndefined();
    expect(lastLine(log.warn.mock.calls, PROGRESSION_FAILED)).toEqual({ errorClass: 'TypeError' });
    expect(reconcile).toHaveBeenCalledTimes(1);
    await tick.close();
  });

  it('polls nothing without a provider, and nothing more once closed', async () => {
    const schedule = new ManualProgressionSchedule();
    const progressDueJobs = vi.fn(() => Promise.resolve(nothing));
    const unavailable = new VideoJobProgressionTick({
      videoJobs: { available: false, progressDueJobs },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log: recordingLog(),
    });

    schedule.fire();
    await unavailable.run();
    expect(progressDueJobs).not.toHaveBeenCalled();
    await unavailable.close();

    const running = new VideoJobProgressionTick({
      videoJobs: { available: true, progressDueJobs },
      intervalMs: INTERVAL_MS,
      maxProviderPolls: 4,
      schedule: schedule.schedule,
      now: schedule.now,
      log: recordingLog(),
    });
    schedule.fire();
    await running.run();
    expect(progressDueJobs).toHaveBeenCalled();
    const passes = progressDueJobs.mock.calls.length;

    await running.close();
    expect(schedule.cancelled).toBe(2);
    await running.run();
    expect(progressDueJobs).toHaveBeenCalledTimes(passes);
  });
});
