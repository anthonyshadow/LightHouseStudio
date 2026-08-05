import { describe, expect, it } from 'vitest';
import { markdownAnchorIds, markdownLinkTargets } from './check-doc-links.mjs';

describe('documentation link helpers', () => {
  it('builds duplicate GitHub-style heading anchors', () => {
    expect([...markdownAnchorIds('# Setup\n## Setup\n### Provider & safety')]).toEqual([
      'setup',
      'setup-1',
      'provider-safety',
    ]);
  });

  it('extracts local Markdown links and images', () => {
    expect(markdownLinkTargets('[guide](docs/guide.md#setup) ![shot](images/a.png)')).toEqual([
      'docs/guide.md#setup',
      'images/a.png',
    ]);
  });
});
