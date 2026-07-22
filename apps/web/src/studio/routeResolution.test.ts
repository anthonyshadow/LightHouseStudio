import { describe, expect, it } from 'vitest';
import { resolveLegacyEntry } from './routeResolution';

const location = (pathname: string, search = ''): Pick<Location, 'pathname' | 'search'> => ({
  pathname,
  search,
});

describe('resolveLegacyEntry', () => {
  it('leaves the bare Studio root canonical', () => {
    expect(resolveLegacyEntry(location('/'))).toEqual({
      canonicalPath: '/',
      canonicalSearch: '',
      shouldReplace: false,
      initialOverlay: null,
    });
  });

  it.each(['/advanced', '/advanced/', '/guided', '/guided/', '/some-retired-page'])(
    'canonicalizes %s to Studio without reopening a retired experience',
    (pathname) => {
      expect(resolveLegacyEntry(location(pathname))).toEqual({
        canonicalPath: '/',
        canonicalSearch: '',
        shouldReplace: true,
        initialOverlay: null,
      });
    },
  );

  it('opens the legacy-project manager for the retired projects entry', () => {
    expect(resolveLegacyEntry(location('/projects/'))).toEqual({
      canonicalPath: '/',
      canonicalSearch: '',
      shouldReplace: true,
      initialOverlay: { kind: 'legacy-projects', focusProjectId: null },
    });
  });

  it.each(['/', '/guided', '/guided/'])(
    'opens and focuses a legacy project from %s',
    (pathname) => {
      expect(resolveLegacyEntry(location(pathname, '?project=project-42'))).toEqual({
        canonicalPath: '/',
        canonicalSearch: '',
        shouldReplace: true,
        initialOverlay: { kind: 'legacy-projects', focusProjectId: 'project-42' },
      });
    },
  );

  it('focuses a project supplied to the retired projects entry', () => {
    expect(resolveLegacyEntry(location('/projects', '?project=%20project-7%20'))).toEqual({
      canonicalPath: '/',
      canonicalSearch: '',
      shouldReplace: true,
      initialOverlay: { kind: 'legacy-projects', focusProjectId: 'project-7' },
    });
  });

  it.each(['?new=1', '?characterFlow=guided', '?unrelated=removed'])(
    'strips the deprecated root query %s without opening another experience',
    (search) => {
      expect(resolveLegacyEntry(location('/', search))).toEqual({
        canonicalPath: '/',
        canonicalSearch: '',
        shouldReplace: true,
        initialOverlay: null,
      });
    },
  );

  it('does not treat a project query on an unknown route as a trusted project entry', () => {
    expect(resolveLegacyEntry(location('/unknown', '?project=project-42'))).toEqual({
      canonicalPath: '/',
      canonicalSearch: '',
      shouldReplace: true,
      initialOverlay: null,
    });
  });

  it('opens the manager without a focus target for an empty or oversized project id', () => {
    expect(resolveLegacyEntry(location('/projects', '?project=%20%20')).initialOverlay).toEqual({
      kind: 'legacy-projects',
      focusProjectId: null,
    });
    expect(
      resolveLegacyEntry(location('/projects', `?project=${'x'.repeat(257)}`)).initialOverlay,
    ).toEqual({ kind: 'legacy-projects', focusProjectId: null });
  });
});
