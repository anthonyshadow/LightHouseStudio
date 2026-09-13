import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

/**
 * What the server's own RSS may grow by while it spools a 300 MB (286 MiB) upload.
 *
 * The bound exists to prove the body is never held in memory, so what matters is the distance from
 * the request size, not a tight fit: buffering would put this near 286 MiB, three times this
 * ceiling. How much is in flight at the peak depends on how fast the spool file drains, so the
 * figure is a property of the disk as much as the transport — measured at about 20 MiB (raw) and
 * 26 MiB (multipart) on a developer SSD, and up to 68 MiB on a shared CI runner writing under
 * contention. A 64 MiB ceiling was inside that spread and failed three CI runs on machine speed
 * while passing every local one. Tighten this only alongside a measurement from the slower of the
 * two, or it will start reporting the runner's disk as a memory regression again.
 */
const SPOOLED_RSS_CEILING_BYTES = 96 * MEBIBYTE;

describe('Bun large-media boundary', () => {
  it('spools raw and multipart 300 MB boundaries with bounded memory and cleanup', async () => {
    // The probe proves cleanup by diffing `lightframe-upload-*` directories in `tmpdir()`.
    // That prefix is not unique to this process, so a sibling test spooling an upload in the same
    // run would be counted as this probe's leak. A private temporary root makes the accounting
    // observe only the directories the probe itself created.
    const probeTemporaryRoot = await mkdtemp(path.join(tmpdir(), 'lightframe-media-probe-root-'));
    let stdout: string;
    try {
      ({ stdout } = await executeFile('bun', ['--no-env-file', probePath], {
        cwd: repositoryRoot,
        timeout: 50_000,
        env: {
          ...process.env,
          TMPDIR: probeTemporaryRoot,
          TMP: probeTemporaryRoot,
          TEMP: probeTemporaryRoot,
        },
      }));
    } finally {
      await rm(probeTemporaryRoot, { recursive: true, force: true });
    }
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
    expect(result.exact.peakRssDeltaBytes).toBeLessThanOrEqual(SPOOLED_RSS_CEILING_BYTES);
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
    expect(result.multipart.peakRssDeltaBytes).toBeLessThanOrEqual(SPOOLED_RSS_CEILING_BYTES);
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
