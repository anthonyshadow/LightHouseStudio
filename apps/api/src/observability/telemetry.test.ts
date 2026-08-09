import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';
import { describe, expect, it } from 'vitest';
import { SanitizingSpanExporter } from './telemetry.js';

describe('SanitizingSpanExporter', () => {
  it('allows correlation attributes while removing sensitive URLs, values, and exception details', () => {
    let exported: ReadableSpan[] = [];
    const delegate: SpanExporter = {
      export: (spans) => {
        exported = spans;
      },
      shutdown: () => Promise.resolve(),
    };
    const exporter = new SanitizingSpanExporter(delegate);
    const span = {
      attributes: {
        'http.request.method': 'POST',
        'http.route': '/api/videos/uploads/:uploadId/complete',
        'url.full': 'https://api.example.test/?prompt=private',
        'url.query': 'prompt=private',
        'error.stack': 'Error at /private/local/path.ts',
        'lightframe.operation': 'character-swap',
        prompt: 'private prompt',
      },
      events: [
        {
          attributes: {
            'exception.type': 'StorageError',
            'exception.message': 'failed https://signed.example.test/private',
            'exception.stacktrace': '/private/local/path.ts',
          },
        },
      ],
      links: [{ attributes: { authorization: 'Bearer secret' } }],
    } as unknown as ReadableSpan;

    exporter.export([span], () => undefined);

    expect(exported[0]?.attributes).toEqual({
      'http.request.method': 'POST',
      'http.route': '/api/videos/uploads/:uploadId/complete',
      'lightframe.operation': 'character-swap',
    });
    expect(exported[0]?.events[0]?.attributes).toEqual({ 'exception.type': 'StorageError' });
    expect(exported[0]?.links[0]?.attributes).toEqual({});
  });
});
