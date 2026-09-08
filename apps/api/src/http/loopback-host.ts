/**
 * The one owner of "is this Host header a loopback address this local Studio server may answer".
 *
 * A leaf on purpose. `http/security.ts` imports `application/application-runtime.js` for its types,
 * so the runtime cannot import the predicate back from `security.ts` without a module cycle. This
 * module imports nothing, so both layers can depend on it.
 */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const isLoopbackHostname = (hostname: string): boolean =>
  LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());

/**
 * Parses a Host header into a URL, refusing every form that could smuggle a second target past a
 * hostname comparison: a list, a path, credentials, a query or a fragment.
 */
export const parseHostHeader = (header: string): URL | undefined => {
  if (
    header.includes(',') ||
    header.includes('/') ||
    header.includes('\\') ||
    header.includes('@') ||
    header.includes('?') ||
    header.includes('#')
  )
    return undefined;
  try {
    const parsed = new URL(`http://${header}`);
    if (
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    )
      return undefined;
    return parsed;
  } catch {
    return undefined;
  }
};
