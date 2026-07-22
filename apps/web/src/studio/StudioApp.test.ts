// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { resolveLegacyEntry } from './routeResolution';

const location = (pathname: string, search = ''): Pick<Location, 'pathname' | 'search'> => ({
  pathname,
  search,
});

describe('Studio route cutover', () => {
  it.each(['/', '/advanced', '/guided', '/another-spa-entry'])(
    'resolves %s to the sole Studio root',
    (pathname) => {
      expect(resolveLegacyEntry(location(pathname)).canonicalPath).toBe('/');
    },
  );

  it('opens legacy management instead of the retired project route', () => {
    expect(resolveLegacyEntry(location('/projects', '?project=project-42')).initialOverlay).toEqual(
      {
        kind: 'legacy-projects',
        focusProjectId: 'project-42',
      },
    );
  });
});
