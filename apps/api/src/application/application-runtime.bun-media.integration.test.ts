import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BunMediaBoundaryProbeResult } from '../test/bun-media-boundary.test.probe.js';

const executeFile = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const probePath = fileURLToPath(
  new URL('../test/bun-media-boundary.test.probe.ts', import.meta.url),
);
const MEBIBYTE = 1_024 * 1_024;

describe('Bun large-media boundary', () => {
  it('spools raw and multipart 300 MB boundaries with bounded memory and cleanup', async () => {
    const { stdout } = await executeFile('bun', ['--no-env-file', probePath], {
      cwd: repositoryRoot,
      timeout: 50_000,
    });
    const result = JSON.parse(stdout.trim()) as BunMediaBoundaryProbeResult;

    expect(result.exact).toMatchObject({
      status: 200,
      byteLength: 300_000_000,
      cleanupConfirmed: true,
    });
    expect(result.exact.checksumSha256).toBe(
      '11b6a705e1173dc28bbbd365a753c1140cfda5cd69f39926e52dbf0e77e0acc5',
    );
    // With the legacy transport removed, this invariant proves that the server's
    // RSS growth stays far below the request size instead of inventing a baseline.
    expect(result.exact.peakRssDeltaBytes).toBeLessThanOrEqual(64 * MEBIBYTE);
    expect(result.exact.clientPeakQueuedBytes).toBeLessThanOrEqual(2 * MEBIBYTE);
    expect(result.exact.clientDrainEvents).toBeGreaterThan(0);
    expect(result.declaredOverLimit).toEqual({
      status: 413,
      errorCode: 'payload_too_large',
    });
    expect(result.multipart).toMatchObject({
      status: 200,
      byteLength: 300_000_000,
      cleanupConfirmed: true,
      operation: 'character-swap',
    });
    expect(result.multipart.peakRssDeltaBytes).toBeLessThanOrEqual(64 * MEBIBYTE);
    expect(result.cancelled).toEqual({
      temporaryDirectoryObserved: true,
      cleanupConfirmed: true,
      bodyCancelObserved: true,
      status: 499,
    });
    expect(result.realSocketCancel).toEqual({
      bytesSent: 16 * MEBIBYTE,
      temporaryDirectoryObserved: true,
      cleanupConfirmed: true,
    });
    expect(result.finalNewUploadDirectories).toEqual([]);
    expect(result.totalDurationMs).toBeLessThan(45_000);
  }, 55_000);
});
