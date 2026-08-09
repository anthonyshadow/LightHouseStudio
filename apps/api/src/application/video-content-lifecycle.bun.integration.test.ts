import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BunVideoContentLifecycleProbeResult } from '../test/bun-video-content-lifecycle-probe.js';

const executeFile = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const probePath = fileURLToPath(
  new URL('../test/bun-video-content-lifecycle-probe.ts', import.meta.url),
);

describe('Bun video content stream lifecycle', () => {
  it('settles complete, HEAD, and disconnected delivery leases exactly once', async () => {
    const { stdout } = await executeFile('bun', ['--no-env-file', probePath], {
      cwd: repositoryRoot,
      timeout: 20_000,
    });
    const result = JSON.parse(stdout.trim()) as BunVideoContentLifecycleProbeResult;

    expect(result.fullGet).toMatchObject({
      status: 200,
      bodyBytes: Buffer.byteLength('complete-video-response'),
      contentLength: String(Buffer.byteLength('complete-video-response')),
      settleCalls: [true],
      fileRemoved: true,
    });
    expect(result.head).toMatchObject({
      status: 200,
      bodyBytes: 0,
      contentLength: String(Buffer.byteLength('head-video-response')),
      settleCalls: [true],
      fileRemoved: true,
      filePresentBeforeSettlementRelease: true,
    });
    expect(result.disconnectedGet.bodyBytes).toBeGreaterThan(0);
    expect(result.disconnectedGet).toMatchObject({
      settleCalls: [false],
      fileRemoved: true,
    });
    expect(result.providerWait.started).toBe(true);
    expect(result.providerWait.abortCalls).toBe(1);
    expect(result.providerWait.abortReason).toMatch(/disconnect|abort/iu);
  }, 25_000);
});
