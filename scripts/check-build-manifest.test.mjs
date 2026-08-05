import { describe, expect, it } from 'vitest';
import { staticManifestClosure } from './check-build-manifest.mjs';

describe('staticManifestClosure', () => {
  it('follows static imports without pulling dynamic imports into the entry closure', () => {
    const manifest = {
      'index.html': { file: 'index.js', imports: ['shared'], dynamicImports: ['studio'] },
      shared: { file: 'shared.js' },
      studio: { file: 'studio.js', imports: ['shared'] },
    };
    expect([...staticManifestClosure(manifest, 'index.html')]).toEqual(['index.html', 'shared']);
  });

  it('rejects an unresolved static import', () => {
    expect(() =>
      staticManifestClosure(
        { 'index.html': { file: 'index.js', imports: ['missing'] } },
        'index.html',
      ),
    ).toThrow('Missing imported build-manifest entry');
  });
});
