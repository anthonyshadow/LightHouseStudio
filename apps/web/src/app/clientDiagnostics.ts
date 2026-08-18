/**
 * A bounded, in-memory record of what crashed the browser app.
 *
 * Lightframe ships no telemetry: nothing here is sent anywhere, stored, or persisted across a
 * reload. The point is narrower than telemetry — a route crash used to leave no trace at all
 * (`componentDidCatch` had an empty body), so an operator who hit the fallback screen and could
 * not open devtools had nothing to hand over. The buffer gives them something to copy, and the
 * console line gives a developer something to read, without either exposing a raw error in the UI
 * or putting the operator's failure on the network.
 *
 * Bounded on purpose: a crash loop must not grow the heap it is already failing in.
 */
export const CLIENT_DIAGNOSTIC_LIMIT = 10;

/** Long minified production stacks add noise, not information, to something a human will paste. */
const STACK_LINE_LIMIT = 12;

export interface ClientDiagnostic {
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  readonly componentStack: string | null;
}

const diagnostics: ClientDiagnostic[] = [];

const truncateStack = (stack: string | null | undefined): string | null => {
  if (!stack) return null;
  const lines = stack.split('\n').slice(0, STACK_LINE_LIMIT);
  return lines.join('\n');
};

const describe = (error: unknown): { name: string; message: string; stack: string | null } => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: truncateStack(error.stack) };
  }
  return { name: 'UnknownError', message: String(error), stack: null };
};

export const recordClientError = (error: unknown, componentStack?: string | null): void => {
  const { name, message, stack } = describe(error);
  diagnostics.push({ name, message, stack, componentStack: truncateStack(componentStack) });
  if (diagnostics.length > CLIENT_DIAGNOSTIC_LIMIT) {
    diagnostics.splice(0, diagnostics.length - CLIENT_DIAGNOSTIC_LIMIT);
  }
};

export const readClientDiagnostics = (): readonly ClientDiagnostic[] => [...diagnostics];

export const clearClientDiagnostics = (): void => {
  diagnostics.length = 0;
};

/** Plain text, because its only destination is the operator's clipboard and then a message. */
export const formatClientDiagnostics = (): string =>
  diagnostics
    .map((entry, index) =>
      [`#${index + 1} ${entry.name}: ${entry.message}`, entry.stack, entry.componentStack]
        .filter((part): part is string => Boolean(part))
        .join('\n'),
    )
    .join('\n\n');

/**
 * Vite serves each route chunk from a hashed URL, so a deploy that lands while a session is open
 * makes the *next* lazy import 404. React reports that as an ordinary render error, which is how a
 * routine "you are one version behind" ends up wearing the same "Studio could not load" copy as a
 * genuine crash. The messages are Vite's and the browsers'; matching them is the only signal
 * available, since no error class is shared across engines.
 */
export const isChunkLoadError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('failed to load module script')
  );
};
