import { describe, expect, it } from 'vitest';
import {
  readStudioNavigationState,
  resolveLegacyEntry,
  toStudioNavigationState,
} from './routeResolution';

const location = (pathname: string, search = ''): Pick<Location, 'pathname' | 'search'> => ({
  pathname,
  search,
});

describe('resolveLegacyEntry', () => {
  it('leaves the bare application entry canonical', () => {
    expect(resolveLegacyEntry(location('/'))).toEqual({
      canonicalPath: '/',
      canonicalSearch: '',
      shouldReplace: false,
      initialOverlay: null,
    });
  });

  it.each(['/advanced', '/advanced/', '/guided', '/guided/'])(
    'canonicalizes the known retired entry %s to Studio',
    (pathname) => {
      expect(resolveLegacyEntry(location(pathname))).toEqual({
        canonicalPath: '/studio',
        canonicalSearch: '',
        shouldReplace: true,
        initialOverlay: null,
      });
    },
  );

  it('opens the legacy-project manager for the retired projects entry', () => {
    expect(resolveLegacyEntry(location('/projects/'))).toEqual({
      canonicalPath: '/studio',
      canonicalSearch: '',
      shouldReplace: true,
      initialOverlay: { kind: 'legacy-projects', focusProjectId: null },
    });
  });

  it.each(['/', '/guided', '/guided/'])(
    'opens and focuses a legacy project from %s',
    (pathname) => {
      expect(resolveLegacyEntry(location(pathname, '?project=project-42'))).toEqual({
        canonicalPath: '/studio',
        canonicalSearch: '',
        shouldReplace: true,
        initialOverlay: { kind: 'legacy-projects', focusProjectId: 'project-42' },
      });
    },
  );

  it('focuses a trimmed project supplied to the retired projects entry', () => {
    expect(resolveLegacyEntry(location('/projects', '?project=%20project-7%20'))).toEqual({
      canonicalPath: '/studio',
      canonicalSearch: '',
      shouldReplace: true,
      initialOverlay: { kind: 'legacy-projects', focusProjectId: 'project-7' },
    });
  });

  it.each(['?new=1', '?characterFlow=guided'])(
    'moves the deprecated root query %s to Studio',
    (search) => {
      expect(resolveLegacyEntry(location('/', search))).toEqual({
        canonicalPath: '/studio',
        canonicalSearch: '',
        shouldReplace: true,
        initialOverlay: null,
      });
    },
  );

  it('strips unrelated root queries while keeping the creator at the entry page', () => {
    expect(resolveLegacyEntry(location('/', '?unrelated=removed'))).toEqual({
      canonicalPath: '/',
      canonicalSearch: '',
      shouldReplace: true,
      initialOverlay: null,
    });
  });

  it('sends unknown paths to the entry page even when they contain a project query', () => {
    expect(resolveLegacyEntry(location('/unknown', '?project=project-42'))).toEqual({
      canonicalPath: '/',
      canonicalSearch: '',
      shouldReplace: true,
      initialOverlay: null,
    });
  });

  it('accepts Studio with a trailing slash or query but returns its canonical URL', () => {
    expect(resolveLegacyEntry(location('/studio/', '?unrelated=removed'))).toEqual({
      canonicalPath: '/studio',
      canonicalSearch: '',
      shouldReplace: true,
      initialOverlay: null,
    });
  });

  it('opens the manager without a focus target for an empty or oversized projects id', () => {
    expect(resolveLegacyEntry(location('/projects', '?project=%20%20')).initialOverlay).toEqual({
      kind: 'legacy-projects',
      focusProjectId: null,
    });
    expect(
      resolveLegacyEntry(location('/projects', `?project=${'x'.repeat(257)}`)).initialOverlay,
    ).toEqual({ kind: 'legacy-projects', focusProjectId: null });
  });
});

describe('Studio navigation state', () => {
  it('round-trips the allowlisted legacy overlay state', () => {
    const state = toStudioNavigationState({
      kind: 'legacy-projects',
      focusProjectId: ' project-7 ',
    });
    expect(readStudioNavigationState(state)).toEqual({
      initialOverlay: { kind: 'legacy-projects', focusProjectId: 'project-7' },
    });
  });

  it.each([
    null,
    { initialOverlay: { kind: 'other', focusProjectId: null } },
    { initialOverlay: { kind: 'legacy-projects', focusProjectId: 42 } },
    {
      initialOverlay: {
        kind: 'legacy-projects',
        focusProjectId: 'x'.repeat(257),
      },
    },
  ])('rejects untrusted state %#', (state) => {
    expect(readStudioNavigationState(state)).toBeNull();
  });
});
