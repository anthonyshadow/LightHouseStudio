import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';

const workflowTracer = trace.getTracer('lightframe.workflow');

const safeAttribute = (key: string): boolean =>
  key.startsWith('lightframe.') ||
  [
    'error.type',
    'exception.type',
    'http.request.id',
    'http.request.method',
    'http.response.status_code',
    'http.route',
    'server.address',
    'server.port',
    'url.path',
    'url.scheme',
  ].includes(key);

const sanitizeAttributes = (attributes: Attributes): Attributes =>
  Object.fromEntries(Object.entries(attributes).filter(([key]) => safeAttribute(key)));

const sanitizeSpan = (span: ReadableSpan): void => {
  const mutable = span as ReadableSpan & {
    attributes: Attributes;
    events: { attributes?: Attributes }[];
    links: { attributes?: Attributes }[];
  };
  mutable.attributes = sanitizeAttributes(span.attributes);
  for (const event of mutable.events) {
    event.attributes = sanitizeAttributes(event.attributes ?? {});
  }
  for (const link of mutable.links) link.attributes = {};
};

/** Final export boundary: only explicitly safe, bounded attributes may leave the process. */
export class SanitizingSpanExporter implements SpanExporter {
  constructor(private readonly delegate: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter['export']>[1]): void {
    for (const span of spans) sanitizeSpan(span);
    this.delegate.export(spans, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}

export const currentTraceId = (): string | undefined => {
  const context = trace.getActiveSpan()?.spanContext();
  return context?.traceId === undefined || /^0+$/u.test(context.traceId)
    ? undefined
    : context.traceId;
};

export const withWorkflowSpan = <Result>(
  name: string,
  attributes: Attributes,
  operation: () => Result | Promise<Result>,
): Promise<Result> =>
  workflowTracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await operation();
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException({
        name: error instanceof Error ? error.name : 'NonErrorFailure',
        message: 'Workflow operation failed.',
      });
      throw error;
    } finally {
      span.end();
    }
  });
