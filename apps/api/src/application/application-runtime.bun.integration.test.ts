import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BunRuntimeContractProbeResult } from '../test/bun-runtime-contract-probe.js';

const executeFile = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const probePath = fileURLToPath(new URL('../test/bun-runtime-contract-probe.ts', import.meta.url));

describe('Bun production listener contract', () => {
  it('preserves security, routing, static, HEAD, and listener lifecycle behavior', async () => {
    const { stdout } = await executeFile('bun', ['--no-env-file', probePath], {
      cwd: repositoryRoot,
      timeout: 30_000,
    });
    const result = JSON.parse(stdout.trim()) as BunRuntimeContractProbeResult;

    expect(result.health).toMatchObject({
      status: 200,
      body: '{"ok":true}',
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'no-store',
    });
    expect(result.healthHead).toMatchObject({
      status: 200,
      body: '',
      contentLength: '11',
      cacheControl: 'no-store',
    });
    expect(result.trailingSlash.status).toBe(404);
    expect(result.staticAsset).toMatchObject({
      status: 200,
      body: 'static bytes',
      cacheControl: 'no-store',
    });
    expect(result.staticBadHost.status).toBe(421);
    expect(result.spaHtml).toMatchObject({ status: 200, contentType: 'text/html; charset=utf-8' });
    expect(result.spaJson.status).toBe(404);
    expect(result.apiStaticShadow).toMatchObject({
      status: 404,
      contentType: 'application/json; charset=utf-8',
    });
    expect(result.apiStaticShadow.body).not.toContain('must never be served');
    expect(result.duplicateBindRejected).toBe(true);
    expect(result.repeatedCloseUsesSamePromise).toBe(true);
    expect(result.unauthorizedBodyPulls).toBe(0);
    expect(result.unauthorizedBodyStatus).toBe(401);
    expect(result.unauthorizedDeclaredBody).toMatchObject({
      status: 401,
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'no-store',
      pragma: 'no-cache',
    });
    expect(JSON.parse(result.unauthorizedDeclaredBody.body)).toMatchObject({
      error: { code: 'authentication_required' },
    });
    expect(result.unauthorizedOverGlobalCeiling).toMatchObject({
      status: 401,
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'no-store',
      pragma: 'no-cache',
    });
    expect(result.maliciousHostOversizedBody).toMatchObject({
      status: 421,
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'no-store',
      pragma: 'no-cache',
    });
    expect(JSON.parse(result.maliciousHostOversizedBody.body)).toMatchObject({
      error: { code: 'forbidden_origin' },
    });
    expect(result.malformedHostResponses).toHaveLength(4);
    for (const response of result.malformedHostResponses) {
      expect(response).toMatchObject({
        status: 421,
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'no-store',
        pragma: 'no-cache',
      });
      expect(JSON.parse(response.body)).toMatchObject({
        error: { code: 'forbidden_origin' },
      });
    }
    expect(result.healthAfterMalformedHosts).toMatchObject({
      status: 200,
      body: '{"ok":true}',
      cacheControl: 'no-store',
    });
    expect(result.authorizedRouteLimitExceeded).toMatchObject({
      status: 413,
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'no-store',
      pragma: 'no-cache',
    });
    expect(JSON.parse(result.authorizedRouteLimitExceeded.body)).toMatchObject({
      error: { code: 'payload_too_large' },
    });
    expect(result.http11AbsoluteFormWithHostStatus).toBe(200);
    expect(result.http10AbsoluteFormWithoutHostStatus).toBe(421);
    expect(result.transportFinishedBody).toBe('transport-finished');
    expect(result.transportSettlementStarted).toBe(true);
    expect(result.closeWaitedForTransportSettlement).toBe(true);
  }, 35_000);
});
