import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../provider-error.js';
import { DecartSdkTokenProvider, type TokenRequestScope } from './token-provider.js';

const sdkMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createToken: vi.fn(),
}));

vi.mock('@decartai/sdk', () => ({
  createDecartClient: sdkMocks.createClient,
  noopLogger: {},
}));

const scope = (signal: AbortSignal = new AbortController().signal): TokenRequestScope => ({
  model: 'lucy-2.5',
  origin: 'http://localhost:5173',
  expiresInSeconds: 300,
  maxSessionDurationSeconds: 300,
  signal,
});

describe('DecartSdkTokenProvider', () => {
  beforeEach(() => {
    sdkMocks.createToken.mockReset();
    sdkMocks.createClient.mockReset();
    sdkMocks.createClient.mockReturnValue({ tokens: { create: sdkMocks.createToken } });
  });

  it('uses the official SDK with telemetry/logging disabled and an exact scope', async () => {
    sdkMocks.createToken.mockResolvedValue({
      apiKey: 'temporary-client-token',
      expiresAt: '2030-01-01T00:00:00Z',
      token: 'ignored-jwt',
      permissions: { origins: ['ignored'] },
    });

    const provider = new DecartSdkTokenProvider('server-only-placeholder');
    await expect(provider.createToken(scope())).resolves.toEqual({
      apiKey: 'temporary-client-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(sdkMocks.createClient).toHaveBeenCalledWith({
      apiKey: 'server-only-placeholder',
      telemetry: false,
      logger: {},
    });
    expect(sdkMocks.createToken).toHaveBeenCalledWith({
      expiresIn: 300,
      allowedModels: ['lucy-2.5'],
      allowedOrigins: ['http://localhost:5173'],
      constraints: { realtime: { maxSessionDuration: 300 } },
    });
  });

  it('rejects malformed SDK responses without returning provider data', async () => {
    sdkMocks.createToken.mockResolvedValue({ apiKey: '', expiresAt: 'not-a-date' });
    const provider = new DecartSdkTokenProvider('server-only-placeholder');

    await expect(provider.createToken(scope())).rejects.toMatchObject({
      name: 'ProviderError',
      operation: 'token',
      reason: 'invalid-response',
    });
  });

  it('rejects a malformed SDK client before attempting token issuance', async () => {
    sdkMocks.createClient.mockReturnValue({ tokens: {} });
    const provider = new DecartSdkTokenProvider('server-only-placeholder');

    await expect(provider.createToken(scope())).rejects.toMatchObject({
      operation: 'token',
      reason: 'invalid-response',
    });
    expect(sdkMocks.createToken).not.toHaveBeenCalled();
  });

  it('invalidates issuance when the caller aborts', async () => {
    sdkMocks.createToken.mockImplementation(() => new Promise(() => undefined));
    const provider = new DecartSdkTokenProvider('server-only-placeholder');
    const controller = new AbortController();
    const pending = provider.createToken(scope(controller.signal));
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(ProviderError);
  });

  it('bounds a stalled SDK request with a safe timeout', async () => {
    sdkMocks.createToken.mockImplementation(() => new Promise(() => undefined));
    const provider = new DecartSdkTokenProvider('server-only-placeholder', 1);

    await expect(provider.createToken(scope())).rejects.toMatchObject({
      operation: 'token',
      reason: 'timeout',
    });
  });
});
