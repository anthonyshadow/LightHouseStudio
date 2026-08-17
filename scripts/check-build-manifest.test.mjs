import { describe, expect, it } from 'vitest';
import {
  BUILD_CLOSURE_BUDGETS,
  FORBIDDEN_CLOSURE_DEPENDENCIES,
  staticManifestClosure,
} from './check-build-manifest.mjs';

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

describe('forbidden closure dependencies', () => {
  const shellPatterns = FORBIDDEN_CLOSURE_DEPENDENCIES['src/app/shell/AuthenticatedShell.tsx'];
  const matches = (identity) => shellPatterns.some((pattern) => pattern.test(identity));

  /**
   * The regressions this guard exists for. Each is a real coupling that used to hold: the shell
   * imported the upload workflow for one helper function, and the Studio's stage column lived in
   * the same component as the Dashboard.
   */
  it.each([
    '_useExistingVideoWorkflow-DYOQCgmi.js',
    '_recording-HUkXPp4M.js',
    '_videoEditShader-DJWyjD0X.js',
    '_TakeReviewActions-BQb6oXrR.js',
    'livekit-client.esm-D7LTBSjR.js',
    'mediabunny-aac-encoder-C4e_TRRO.js',
  ])('keeps %s out of the authenticated shell closure', (chunk) => {
    expect(matches(chunk)).toBe(true);
  });

  it.each(['_schemas-Cn6GJaYW.js', '_apiClient-CMbCsDGi.js', '_ui-BOYQ_tZV.js'])(
    'still allows %s, which every authenticated surface needs',
    (chunk) => {
      expect(matches(chunk)).toBe(false);
    },
  );

  it('guards every root that carries a budget', () => {
    expect(Object.keys(FORBIDDEN_CLOSURE_DEPENDENCIES)).toEqual(
      expect.arrayContaining(['index.html', 'src/app/shell/AuthenticatedShell.tsx']),
    );
    expect(Object.keys(BUILD_CLOSURE_BUDGETS)).toEqual(
      expect.arrayContaining(Object.keys(FORBIDDEN_CLOSURE_DEPENDENCIES)),
    );
  });
});
