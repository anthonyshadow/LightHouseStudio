import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BunSignalShutdownProbeResult } from '../test/bun-signal-shutdown-probe.js';

const executeFile = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const probePath = fileURLToPath(new URL('../test/bun-signal-shutdown-probe.ts', import.meta.url));

describe('Bun signal shutdown contract', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    '%s stops the listener and closes hooks once in registration order',
    async (signal) => {
      const { stdout } = await executeFile('bun', ['--no-env-file', probePath, signal], {
        cwd: repositoryRoot,
        timeout: 5_000,
      });
      const result = JSON.parse(stdout.trim()) as BunSignalShutdownProbeResult;

      expect(result).toMatchObject({
        signal,
        healthStatus: 200,
        closeUsesOnePromise: true,
        listenerStoppedBeforeHooks: true,
        firstHookCalls: 1,
        secondHookCalls: 1,
        rebindSucceeded: true,
      });
      expect(result.closeSequence).toEqual([
        `signal:${signal}`,
        'first:start',
        'first:listener-stopped',
        'first:end',
        'second:start',
        'second:end',
      ]);
    },
    8_000,
  );
});
